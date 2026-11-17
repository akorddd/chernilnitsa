#!/usr/bin/env python3
"""Собирает сайт в один HTML-файл для артефакта Claude (Чернильница с синхронизацией).

Запуск: python3 tools/build-artifact.py [путь_результата]
По умолчанию пишет dist/chernilnitsa.html. CSS и JS из index.html вставляются внутрь.
"""
import pathlib, re, sys

root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'index.html').read_text(encoding='utf-8')

def css(m):
    return '<style>' + (root / m.group(1)).read_text(encoding='utf-8') + '</style>'

def js(m):
    code = (root / m.group(1)).read_text(encoding='utf-8')
    return '<script>' + code.replace('</script', '<\\/script') + '</script>'

html = re.sub(r'<link rel="stylesheet" href="(css/[^"]+)">', css, html)
html = re.sub(r'<script src="(js/[^"]+)"></script>', js, html)
assert 'src="js/' not in html and 'href="css/' not in html

out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'dist' / 'chernilnitsa.html'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(html, encoding='utf-8')
print(out, len(html.encode('utf-8')), 'байт')
