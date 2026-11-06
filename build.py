#!/usr/bin/env python3
"""Builds app.js from src/*.js (in dependency order) and video-field.html: the whole site in one file."""
import os
root = os.path.dirname(os.path.abspath(__file__)) + '/'
rd = lambda f: open(root + f, encoding='utf-8').read()
ORDER = ['a_head', 'b_gpu', 'c_grid', 'd_sizing', 'h_ctrl', 'e_layers', 'f_audio', 'g_hud', 'h2_frame', 'i_fx', 'j_plan', 'l_video', 'k_export', 'm_ui']
parts = [rd(f'src/{n}.js') for n in ORDER]
head = parts[0].split('\n')
# a_head already opens the closure ("(() => {" and 'use strict'); close it at the end
app = '\n'.join(parts) + '\n})();\n'
open(root + 'app.js', 'w', encoding='utf-8').write(app)
idx, css, three, mux = rd('index.html'), rd('style.css'), rd('vendor/three.min.js'), rd('vendor/mp4-muxer.js')
for name, src in (('three', three), ('mux', mux), ('app', app)):
    assert '</script' not in src.lower(), name
body = idx[idx.index('<div id="app">'):idx.index('<script src=')]
out = f'<title>VIDEO·FIELD</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<style>{css}</style>\n{body}\n<script>{three}</script>\n<script>{mux}</script>\n<script>{app}</script>\n'
open(root + 'video-field.html', 'w', encoding='utf-8').write(out)
print('app.js', round(len(app) / 1024), 'KB; video-field.html', round(len(out) / 1024), 'KB')
