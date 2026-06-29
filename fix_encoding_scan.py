#!/usr/bin/env python3
"""Scan backend source files for Windows-1252 garbling."""
import sys, io, os, glob
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

cp1252_to_unicode = {}
unicode_to_cp1252 = {}
for b in range(256):
    try:
        ch = bytes([b]).decode('cp1252')
        cp1252_to_unicode[b] = ch
        if ch not in unicode_to_cp1252:
            unicode_to_cp1252[ch] = b
    except Exception:
        pass

def chars_to_bytes(chars):
    result = []
    for c in chars:
        b = unicode_to_cp1252.get(c)
        if b is None:
            return None
        result.append(b)
    return result

def try_decode_as_utf8(byte_list):
    try:
        return bytes(byte_list).decode('utf-8')
    except Exception:
        return None

SUSPICIOUS = set(cp1252_to_unicode[b] for b in range(0x80, 0x100) if b in cp1252_to_unicode)

def find_and_fix(content):
    fixes = {}
    i = 0
    while i < len(content):
        c = content[i]
        if c not in SUSPICIOUS:
            i += 1
            continue
        found = False
        for length in range(8, 1, -1):
            if i + length > len(content):
                continue
            chunk = content[i:i+length]
            byte_list = chars_to_bytes(chunk)
            if byte_list is None:
                continue
            decoded = try_decode_as_utf8(byte_list)
            if decoded is None:
                continue
            if all(ord(ch) < 128 for ch in decoded):
                continue
            if any(ord(ch) < 0x20 or (0x7F <= ord(ch) <= 0x9F) for ch in decoded):
                continue
            if chunk not in fixes:
                fixes[chunk] = decoded
            found = True
            i += length
            break
        if not found:
            i += 1
    return fixes

patterns = ['src/**/*.ts', 'src/**/*.js']
all_files = []
for p in patterns:
    all_files.extend(glob.glob(p, recursive=True))

grand_total = 0
for filepath in sorted(all_files):
    if 'node_modules' in filepath or '__pycache__' in filepath:
        continue
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"SKIP {filepath}: {e}")
        continue

    fixes = find_and_fix(content)
    if not fixes:
        continue

    original = content
    file_total = 0
    for garbled, fixed in sorted(fixes.items(), key=lambda x: -len(x[0])):
        count = content.count(garbled)
        if count > 0:
            content = content.replace(garbled, fixed)
            file_total += count

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"\n{filepath}: {file_total} fixes")
        for garbled, fixed in sorted(fixes.items(), key=lambda x: original.count(x[0]), reverse=True):
            count = original.count(garbled)
            if count > 0:
                print(f"  {count}x {repr(garbled[:8])} -> {repr(fixed[:8])}")
        grand_total += file_total

print(f"\nGrand total: {grand_total} fixes")
