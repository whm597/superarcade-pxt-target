#include "RAFFS.h"
#include "CodalDmesg.h"
#include "NotifyEvents.h"
#include "MessageBus.h"
#include "Timer.h"
#include "pxtbase.h"

#include <stddef.h>

// SuperArcade: USART1 PA9 @115200 调试打印（QCOM 可看）
static void raffs_dbg(const char *s) {
    RCC->AHB1ENR |= RCC_AHB1ENR_GPIOAEN;
    RCC->APB2ENR |= RCC_APB2ENR_USART1EN;
    GPIOA->MODER = (GPIOA->MODER & ~(3u << 18)) | (2u << 18);
    GPIOA->AFR[1] = (GPIOA->AFR[1] & ~(0xFu << 4)) | (7u << 4);
    USART1->BRR = 729;
    USART1->CR1 |= USART_CR1_TE | USART_CR1_UE;
    while (*s) {
        while (!(USART1->SR & USART_SR_TXE)) ;
        USART1->DR = (uint8_t)*s++;
    }
}
static void raffs_dbg_hex(uint32_t v) {
    const char *hex = "0123456789ABCDEF";
    char b[9] = { hex[(v >> 28) & 0xF], hex[(v >> 24) & 0xF], hex[(v >> 20) & 0xF], hex[(v >> 16) & 0xF],
                  hex[(v >> 12) & 0xF], hex[(v >> 8) & 0xF], hex[(v >> 4) & 0xF], hex[v & 0xF], 0 };
    raffs_dbg(b);
}

#define RAFFS_MAGIC 0x7776e0da
#define M1 0xffffffffU

#define CHECK
//#undef CHECK

using namespace codal;

#define oops() target_panic(DEVICE_FLASH_ERROR)

#define OFF2(v, basePtr) (uint32_t)((uint8_t *)v - (uint8_t *)basePtr)
#define OFF(v) OFF2(v, basePtr)

#define REAL_OFF(dst) (OFF(dst) <= OFF2(dst, altBasePtr()) ? OFF(dst) : OFF2(dst, altBasePtr()))

#undef NOLOG
#define NOLOG(...) ((void)0)
#ifndef RAFFS_TEST
#define LOG DMESG
#define LOGV NOLOG
#endif

#define LOGVV NOLOG

#if 0
#undef LOGV
#define LOGV DMESG
#endif

#if 0
#undef LOGVV
#define LOGVV DMESG
#endif

using namespace pxt::raffs;

static uint16_t raffs_unlocked_event;

struct FSHeader {
    uint32_t magic;
    uint32_t bytes;
    uint32_t numgc;
    uint32_t reserved;
};

static uint16_t fnhash(const char *fn) {
    uint32_t h = hash_fnv1(fn, strlen(fn));
    return h ^ (h >> 16);
}

FS::FS(Flash &flash, uintptr_t baseAddr, uint32_t bytes)
    : flash(flash), baseAddr(baseAddr), bytes(bytes) {
    locked = false;

    basePtr = NULL;
    endPtr = NULL;
    freeDataPtr = NULL;
    metaPtr = NULL;
    readDirPtr = NULL;
    cachedMeta = NULL;
    flashBufAddr = 0;
    blocked = NULL;
    gcHorizon = -10000000;
    minGCSpacing = 0;

    if (bytes > 0x20000)
        oops();

    auto page = flash.pageSize(baseAddr);
    // baseAddr and bytes needs to page-aligned, and we need even number of pages
    auto numPages = bytes / page;
    if ((baseAddr & (page - 1)) || bytes % page || numPages < 2 || (numPages & 1))
        oops();

    if (!raffs_unlocked_event)
        raffs_unlocked_event = codal::allocateNotifyEvent();
}

void FS::erasePages(uintptr_t addr, uint32_t len) {
    raffs_dbg("[R] erase\r\n");
    auto end = addr + len;
    auto page = flash.pageSize(addr);
    if (addr & (page - 1))
        oops();
    while (addr < end) {
        if (flash.pageSize(addr) != page)
            oops();
        flash.erasePage(addr);
#ifdef CHECK
        for (int i = 0; i < page; ++i)
            if (((uint8_t *)addr)[i] != 0xff)
                oops();
#endif
        addr += page;
    }
}

void FS::oopsAndClear() {
    erasePages(baseAddr, bytes);
    oops();
}

void FS::flushFlash() {
    if (flashBufAddr) {
        raffs_dbg("[R] flush\r\n");
        int r = flash.writeBytes(flashBufAddr, flashBuf, sizeof(flashBuf));
        if (r)
            oopsAndClear();
#ifdef CHECK
        for (unsigned i = 0; i < sizeof(flashBuf); ++i)
            if (flashBuf[i] != 0xff && flashBuf[i] != ((uint8_t *)flashBufAddr)[i])
                oopsAndClear();
#endif
        flashBufAddr = 0;
    }
}

void FS::writeBytes(void *dst, const void *src, uint32_t size) {
    LOGVV("write %x%s %d %x:%x:%x:%x", REAL_OFF(dst), OFF(dst) == REAL_OFF(dst) ? "" : "*", size,
          ((const uint8_t *)src)[0], ((const uint8_t *)src)[1], ((const uint8_t *)src)[2],
          ((const uint8_t *)src)[3]);

    while (size > 0) {
        uint32_t off = (uintptr_t)dst & (sizeof(flashBuf) - 1);
        uintptr_t newaddr = (uintptr_t)dst - off;
        if (newaddr != flashBufAddr) {
            flushFlash();
            memset(flashBuf, 0xff, sizeof(flashBuf));
            flashBufAddr = newaddr;
        }

        unsigned n = sizeof(flashBuf) - off;
        if (n > size)
            n = size;
        memcpy(flashBuf + off, src, n);
        size -= n;
        src = (const uint8_t *)src + n;
        dst = (uint8_t *)dst + n;
    }
}

#define IS_VALID(hd) ((hd)->magic == RAFFS_MAGIC && (hd)->bytes == bytes)

void FS::format() {
    raffs_dbg("[R] format\r\n");
    cachedMeta = NULL;
    readDirPtr = NULL;
    clearBlocked();

    LOG("formatting...");

    FSHeader hd;
    hd.reserved = M1;
    hd.numgc = 1;

    // in case the secondary header is valid, copy #gc
    auto hd2 = (FSHeader *)(baseAddr + bytes / 2);
    if (IS_VALID(hd2)) {
        hd.numgc = hd2->numgc + 1;
    }

    // SuperArcade fix v11: 双半区全擦——原版只擦半区0，半区1 历史残留（32K 时代数据）
    // 导致切换后页编程 0→1 失败、meta 区损坏（读档 -1 根因之一）
    erasePages(baseAddr, bytes);
    // write the primary header
    hd.magic = RAFFS_MAGIC;
    hd.bytes = bytes;
    writeBytes((void *)baseAddr, &hd, sizeof(hd));

    flushFlash();
}

#define NUMBLOCKED (int)(sizeof(blocked->fnptrs) / sizeof(uint16_t))

bool FS::checkBlocked(MetaEntry *m) {
    auto fnptr = m->fnptr;
    for (auto p = blocked; p; p = p->next) {
        for (int i = 0; i < NUMBLOCKED; ++i)
            if (p->fnptrs[i] == fnptr) {
                if (m->isFirst())
                    p->fnptrs[i] = 0;
                return true;
            }
    }
    if (!m->isFirst()) {
        for (auto p = blocked; p; p = p->next) {
            for (int i = 0; i < NUMBLOCKED; ++i)
                if (p->fnptrs[i] == 0) {
                    p->fnptrs[i] = fnptr;
                    return false;
                }
        }
        auto p = new BlockedEntries;
        memset(p, 0, sizeof(*p));
        p->next = blocked;
        blocked = p;
        p->fnptrs[0] = fnptr;
    }
    return false;
}

void FS::clearBlocked() {
    while (blocked) {
        auto p = blocked;
        blocked = p->next;
        delete p;
    }
}

bool FS::tryMount() {
    if (basePtr)
        return true;

    raffs_dbg("[R] tryMount\r\n");

    auto hd0 = (FSHeader *)baseAddr;
    auto hd1 = (FSHeader *)(baseAddr + bytes / 2);

    auto v0 = IS_VALID(hd0);
    auto v1 = IS_VALID(hd1);

    if (v0 && v1) {
        // we account for overflows
        // they should not occur in normal operation though
        if (hd0->numgc + 1 == hd1->numgc)
            v0 = false;
        else if (hd1->numgc + 1 == hd0->numgc || hd1->numgc < hd0->numgc)
            v1 = false;
        else
            v0 = false;
    }

    uintptr_t addr;

    if (v0)
        addr = baseAddr;
    else if (v1)
        addr = baseAddr + bytes / 2;
    else {
        raffs_dbg("[R] mount false\r\n");
        return false;
    }

    basePtr = (uint8_t *)addr;
    endPtr = (MetaEntry *)(addr + bytes / 2);

    // 扫描边界：最低不能低于头部之后（SuperArcade 修复：原版无边界死循环）
    auto lo = (uint32_t *)(basePtr + sizeof(FSHeader));
    auto p = (uint32_t *)endPtr - 2;
    while (p >= lo && *p != M1)
        p -= 2;
    if (p < lo) {
        // meta 区写满无空闲哨兵，结构异常 → 视为未挂载，由 mount() 重建
        basePtr = NULL;
        return false;
    }
    metaPtr = (MetaEntry *)(p + 2);

    p = (uint32_t *)metaPtr - 1;
    while (p >= lo && *p == M1)
        p--;
    if (p < lo)
        freeDataPtr = (uint8_t *)lo; // 数据区全 FF：空文件系统（合法初始状态）
    else
        freeDataPtr = (uint8_t *)RAFFS_ROUND(p + 1);

    auto fp = (uint32_t *)freeDataPtr;
    if (fp[0] != M1 || fp[1] != M1) {
        // SuperArcade 修复：外部 flash 残留坏数据时不再 oops 死循环，回退由 mount() 重建
        basePtr = NULL;
        return false;
    }

    LOG("mounted, end=%x meta=%x free=%x", OFF(endPtr), OFF(metaPtr), OFF(freeDataPtr));
    raffs_dbg("[R] mnt mt="); raffs_dbg_hex(OFF(metaPtr)); raffs_dbg(" fd="); raffs_dbg_hex(OFF(freeDataPtr)); raffs_dbg("\r\n");
    for (auto mp = metaPtr; mp < endPtr; mp++) {
        // SuperArcade fix v9: 损坏记录跳过（防 fnptr 越界打印垃圾串）
        if (mp->fnptr >= bytes / 2 || mp->dataptr >= bytes / 2 || mp->datasize() > bytes / 2)
            continue;
        raffs_dbg("[R] mnt fn="); raffs_dbg(fnptr(mp)); raffs_dbg(" fh="); raffs_dbg_hex(mp->fnhash); raffs_dbg(" sz="); raffs_dbg_hex(mp->datasize()); raffs_dbg(" dp="); raffs_dbg_hex(mp->dataptr); raffs_dbg("\r\n");
    }
    raffs_dbg("[R] mount true\r\n");

    return true;
}

void FS::mount() {
    // if (basePtr) return;
    if (tryMount())
        return;
    raffs_dbg("[R] mount fmt\r\n");
    format();
    raffs_dbg("[R] format done\r\n");
    if (!tryMount())
        oopsAndClear();
}

FS::~FS() {}

int FS::write(const char *keyName, const void *data, uint32_t bytes) {
    raffs_dbg("[R] write fn="); raffs_dbg((char*)keyName); raffs_dbg(" sz="); raffs_dbg_hex(bytes); raffs_dbg("\r\n");
    auto isDel = data == NULL && bytes == M1;
    if (!isDel && !data && bytes)
        oops();

    if (isDel)
        LOGV("del: %s", keyName);
    else
        LOGV("write: %s sz=%d", keyName, bytes);

    lock();
    uint32_t szneeded = bytes;
    auto existing = findMetaEntry(keyName);
    auto prevBase = basePtr;

    cachedMeta = NULL;

    if (!existing) {
        if (isDel) {
            unlock();
            return -1;
        }
        szneeded += strlen(keyName) + 1;
    }

    if (!tryGC(sizeof(MetaEntry) + RAFFS_ROUND(szneeded))) {
        unlock();
        return -1;
    }

    // if the GC happened, find the relocated meta entry
    if (prevBase != basePtr)
        existing = findMetaEntry(keyName);

    MetaEntry newMeta;
    if (existing) {
        newMeta.fnhash = existing->fnhash;
        newMeta.fnptr = existing->fnptr;
    } else {
        newMeta.fnhash = fnhash(keyName);
        newMeta.fnptr = writeData(keyName, strlen(keyName) + 1);
    }
    newMeta.dataptr = isDel ? 0 : writeData(data, bytes);
    newMeta._datasize = bytes;
    if (existing)
        newMeta._datasize |= RAFFS_FOLLOWING_MASK;
    finishWrite();

    writeBytes(--metaPtr, &newMeta, sizeof(newMeta));
    flushFlash();
    raffs_dbg("[R] write done\r\n");

    unlock();
    return 0;
}

int FS::read(const char *keyName, void *data, uint32_t bytes) {
    lock();
    int r = -1;
    MetaEntry *meta;
    raffs_dbg("[R] read fn="); raffs_dbg((char*)keyName); raffs_dbg(" want="); raffs_dbg_hex(bytes); raffs_dbg("\r\n");
    if (keyName) {
        cachedMeta = meta = findMetaEntry(keyName);
    } else {
        meta = cachedMeta;
    }
    if (meta != NULL && meta->dataptr) {
        // SuperArcade fix v9: 损坏记录（指针/大小越半区）视为不存在
        if (meta->dataptr >= this->bytes / 2 || meta->datasize() > this->bytes / 2
            || (uint32_t)meta->dataptr + meta->datasize() > this->bytes / 2) {
            r = -1;
        } else {
            r = meta->datasize();
            if (data) {
                if (bytes > (unsigned)r)
                    bytes = r;
                memcpy(data, basePtr + meta->dataptr, bytes);
            }
        }
    }
    raffs_dbg(" r="); raffs_dbg_hex(r); raffs_dbg("\r\n");
    unlock();
    return r;
}

int FS::remove(const char *keyName) {
    return write(keyName, NULL, M1);
}

void FS::lock() {
    while (locked)
        fiber_wait_for_event(DEVICE_ID_NOTIFY, raffs_unlocked_event);
    locked = true;
    mount();
}

void FS::unlock() {
    if (!locked)
        oops();
    flushFlash();
    locked = false;
#ifndef RAFFS_TEST
    Event(DEVICE_ID_NOTIFY, raffs_unlocked_event);
#endif
}

MetaEntry *FS::findMetaEntry(const char *filename) {
    uint16_t h = fnhash(filename);
    uint16_t buflen = strlen(filename) + 1;

    raffs_dbg("[R] find fn="); raffs_dbg((char*)filename); raffs_dbg(" h="); raffs_dbg_hex(h);
    raffs_dbg(" mp="); raffs_dbg_hex((uint32_t)((uintptr_t)metaPtr - (uintptr_t)basePtr));
    raffs_dbg(" ep="); raffs_dbg_hex((uint32_t)((uintptr_t)endPtr - (uintptr_t)basePtr)); raffs_dbg("\r\n");

    for (auto p = metaPtr; p < endPtr; p++) {
        raffs_dbg("[R]  t fp="); raffs_dbg_hex(p->fnptr); raffs_dbg(" fh="); raffs_dbg_hex(p->fnhash);
        raffs_dbg(" dp="); raffs_dbg_hex(p->dataptr); raffs_dbg(" sz="); raffs_dbg_hex(p->datasize());
        // SuperArcade fix v9: 损坏记录跳过（fnptr 越界时 memcmp 会读非法内存）
        if (p->fnptr >= bytes / 2) { raffs_dbg(" SKIP\r\n"); continue; }
        if (p->fnhash == h) {
            raffs_dbg(" HASH_OK");
            if (memcmp(fnptr(p), filename, buflen) == 0) { raffs_dbg(" MEM_OK -> HIT\r\n"); return p; }
            raffs_dbg(" MEM_FAIL\r\n");
        } else {
            raffs_dbg("\r\n");
        }
    }
    raffs_dbg("[R]  miss\r\n");

    // LOGV("fail");

    return NULL;
}

void FS::forceGC(filename_filter filter) {
    lock();
    tryGC(0x7fff0000, filter);
    unlock();
}

bool FS::tryGC(int spaceNeeded, filename_filter filter) {
    raffs_dbg("[R] gc\r\n");
    int spaceLeft = (intptr_t)metaPtr - (intptr_t)freeDataPtr;

#ifdef RAFFS_TEST
    for (auto p = (uint32_t *)freeDataPtr; p < (uint32_t *)metaPtr; p++) {
        if (*p != M1) {
            LOG("value at %x = %x", OFF(p), *p);
            oopsAndClear();
        }
    }
#endif

    if (spaceLeft > spaceNeeded + 32)
        return true;
    
    int now = (int)system_timer_current_time();
    if (minGCSpacing) {
        gcHorizon += minGCSpacing;
        int nextGC = now - minGCSpacing * 2;
        // LOG("now=%d n=%d gch=%d", now, nextGC, gcHorizon);
        if (nextGC > gcHorizon)
            gcHorizon = nextGC;
        if (gcHorizon > now)
            target_panic(921);
    }

    LOG("running flash FS GC; needed %d, left %d", spaceNeeded, spaceLeft);

    readDirPtr = NULL;
    cachedMeta = NULL;

    auto newBase = (uintptr_t)altBasePtr();

    flushFlash();

    erasePages(newBase, bytes / 2);

    auto metaDst = (MetaEntry *)(newBase + bytes / 2);
    auto newBaseP = (uint8_t *)newBase;
    freeDataPtr = newBaseP + sizeof(FSHeader);

    for (int iter = 0; iter < 2; ++iter) {
        clearBlocked();
        auto offset = sizeof(FSHeader);
        for (auto p = metaPtr; p < endPtr; p++) {
            MetaEntry m = *p;

            // SuperArcade fix v9: 损坏记录防御必须最先执行（防 fnptr 越界导致 strlen 跑飞）
            if (m.fnptr >= bytes / 2 || m.dataptr >= bytes / 2 || m.datasize() > bytes / 2
                || (uint32_t)m.dataptr + m.datasize() > bytes / 2) {
                raffs_dbg("[R] gc skip bad fnptr="); raffs_dbg_hex(m.fnptr);
                raffs_dbg(" dp="); raffs_dbg_hex(m.dataptr);
                raffs_dbg(" sz="); raffs_dbg_hex(m.datasize()); raffs_dbg("\r\n");
                continue;
            }

            const char *fn = fnptr(&m);

            if (filter && !filter(fn))
                continue;

            if (checkBlocked(&m) || m.dataptr == 0)
                continue;

            raffs_dbg("[R] gc meta fn="); raffs_dbg((char*)fn); raffs_dbg(" sz="); raffs_dbg_hex(m.datasize()); raffs_dbg(" dp="); raffs_dbg_hex(m.dataptr); raffs_dbg(" blk="); raffs_dbg_hex(checkBlocked(&m) ? 1 : 0); raffs_dbg("\r\n");
            LOGV("GC %s sz=%d @%x", fn, m.datasize(), m.dataptr);
            auto fnlen = strlen(fn) + 1;
            auto sz = fnlen + m.datasize();

            if (iter == 0) {
                // SuperArcade fix: GC rewrite overflow guard
if ((uintptr_t)freeDataPtr + sz > (uintptr_t)metaDst - 32) {
    raffs_dbg("[R] gc oos guard fd="); raffs_dbg_hex((uint32_t)(freeDataPtr - basePtr));
    raffs_dbg(" md="); raffs_dbg_hex((uint32_t)((uintptr_t)metaDst - (uintptr_t)basePtr));
    raffs_dbg(" sz="); raffs_dbg_hex(sz); raffs_dbg(" half="); raffs_dbg_hex(bytes / 2); raffs_dbg("\r\n");
    // SuperArcade fix v8: GC 溢出时保留旧 FS 不清空（避免丢档与死机），仅返回失败
    flushFlash();
    unlock();
    return false;
}

                // SuperArcade diag: per-record GC rewrite trace
                raffs_dbg("[R] gc rec sz="); raffs_dbg_hex(m.datasize());
                raffs_dbg(" dp="); raffs_dbg_hex(m.dataptr);
                raffs_dbg(" dst="); raffs_dbg_hex((uint32_t)(freeDataPtr - basePtr)); raffs_dbg("\r\n");

auto fd = freeDataPtr;
                writeData(fn, fnlen);
                writeData(basePtr + m.dataptr, m.datasize());
                if (freeDataPtr - fd != (int)sz)
                    oops();
            } else {
                m.fnptr = offset;
                m.dataptr = offset + fnlen;
                m._datasize &= ~RAFFS_FOLLOWING_MASK;
                writeBytes(--metaDst, &m, sizeof(m));
            }
            offset += sz;
        }
        if (iter == 0)
            finishWrite();
    }

    clearBlocked();
    flushFlash();

    LOG("GC done: %d free", (int)((intptr_t)metaDst - (intptr_t)freeDataPtr));

    FSHeader hd;
    hd.magic = RAFFS_MAGIC;
    hd.bytes = bytes;
    hd.numgc = ((FSHeader*)basePtr)->numgc + 1;
    hd.reserved = M1;
    writeBytes(newBaseP, &hd, sizeof(hd));
    flushFlash();

    basePtr = newBaseP;
    endPtr = (MetaEntry *)(newBase + bytes / 2);
    metaPtr = metaDst;

    if ((intptr_t)metaDst - (intptr_t)freeDataPtr <= spaceNeeded + 64) {
        if (filter != NULL && spaceNeeded != 0x7fff0000) {
            LOG("out of space! needed=%d", spaceNeeded);
#ifdef RAFFS_TEST
            oops();
#endif
        }
        raffs_dbg("[R] gc done oos\r\n");
        return false;
    }

    raffs_dbg("[R] gc done\r\n");
    return true;
}

DirEntry *FS::dirRead() {
    lock();

    if (readDirPtr == NULL) {
        readDirPtr = metaPtr;
        clearBlocked();
    }

    while (readDirPtr < endPtr) {
        auto m = *readDirPtr++;
        if (checkBlocked(&m) || m.dataptr == 0)
            continue;
        dirEnt.size = m.datasize();
        dirEnt.flags = 0;
        dirEnt.name = fnptr(&m);
        unlock();
        return &dirEnt;
    }

    readDirPtr = NULL;
    clearBlocked();
    unlock();
    return NULL;
}

uint16_t FS::writeData(const void *data, uint32_t len) {
    LOGVV("writeData: @%x %x:%x sz=%d", REAL_OFF(freeDataPtr), ((const uint8_t *)data)[0],
          ((const uint8_t *)data)[1], len);
    writeBytes(freeDataPtr, data, len);
    auto r = freeDataPtr - basePtr;
    freeDataPtr += len;
    return r;
}

void FS::finishWrite() {
    auto nfp = RAFFS_ROUND(freeDataPtr);
    int tailSz = nfp - (uintptr_t)freeDataPtr;
    uint64_t z = 0;
    if (tailSz) {
        writeData(&z, tailSz);
    } else {
        if (((uint32_t *)nfp)[-1] == M1)
            writeData(&z, 8);
    }
    flushFlash();
}

int FS::readFlashBytes(uintptr_t addr, void *buffer, uint32_t len) {
    lock();
    memcpy(buffer, (void *)addr, len);
    unlock();
    return len;
}

#ifdef RAFFS_TEST
void FS::dump() {}

void FS::debugDump() {
    // dump();
}
#endif