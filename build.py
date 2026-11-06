#!/usr/bin/env python3
"""Builds video-field.html: the whole site (markup, css, three.js, mp4-muxer, app) in one file."""
import os
root = os.path.dirname(os.path.abspath(__file__)) + '/'
rd = lambda f: open(root + f, encoding='utf-8').read()
idx, css, app, three, mux = rd('index.html'), rd('style.css'), rd('app.js'), rd('vendor/three.min.js'), rd('vendor/mp4-muxer.js')
for name, src in (('three', three), ('mux', mux), ('app', app)):
    assert '</script' not in src.lower(), name
body = idx[idx.index('<div id="app">'):idx.index('<script src=')]
out = f'<title>VIDEO·FIELD</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<style>{css}</style>\n{body}\n<script>{three}</script>\n<script>{mux}</script>\n<script>{app}</script>\n'
open(root + 'video-field.html', 'w', encoding='utf-8').write(out)
print(round(len(out) / 1024), 'KB')
