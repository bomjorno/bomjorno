# Emerald Dust — TouchDesigner

Эффект из туториала «Wake up Neo…»: тёмный изумрудный грейд + широкое свечение + распад света на частицы-пыль, всплески на резких движениях/склейках, дрейф камеры, виньетка, хроматика, зерно.

## Использовать в TouchDesigner
1. Открыть TD, `Alt+T` (Textport), выполнить:
   ```python
   exec(open(r'/путь/к/touchdesigner/td_build.py').read())
   ```
2. В `/project1/emerald_dust/movie_in` указать любой видос в параметре **File** (или `MOVIE_PATH` в начале скрипта). Результат в `OUT`; `record_mp4` для записи.
3. Крутить: `lfo_slow`/`lfo_fast` (сколько пыли), `burst_gain` (чувствительность к движению), `burst_lag` (затухание), `blur_*` (размер свечения). Сохранить `File → Save` — получится `.toe`.

Сеть: Movie In → Fit → GLSL pass1 (камера, распад, грейд) → Blur-пирамида → GLSL pass2 (bloom, экспозиция, DOF, CA, виньетка, зерно) → OUT. Драйверы: Cache+Difference → Analyze → Lag = `burst`; два LFO = `dissolve`.

> `td_build.py` не запускался в самом TD (его не было в среде сборки) — при несовпадении имени параметра в вашей версии TD скрипт печатает предупреждение, остальное строится дальше. Шейдеры проверены офлайн.

## Офлайн-рендер без TD (те же шейдеры, WebGL)
```bash
mkdir fr && ffmpeg -i in.mp4 -vf scale=720:720 -q:v 2 fr/f_%04d.jpg
python3 signals.py fr sig.json 25
NODE_PATH=$(npm root -g) node render.js fr sig.json out
ffmpeg -framerate 25 -i out/o_%04d.png -i in.mp4 -map 0:v -map 1:a -c:v libx264 -crf 17 -pix_fmt yuv420p res.mp4
```
`output/emerald_dust_result.mp4` — результат на вашем втором видео. После правки шейдеров: `python3 make_td_script.py`.
