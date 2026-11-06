// ---------------------------------------------------------------- effect catalogue: every effect is a few numbers that change the shader / layers while the frame stays recognisable
const CATS = {cam: ['Камера', 210], dist: ['Искажение кадра', 275], light: ['Свет', 42], color: ['Цвет и грейд', 330], print: ['Печать и графика', 150], tv: ['Плёнка и ТВ', 18], vol: ['Объём и схемы', 190]};
const EFX = {};
const NUM = (k, l, min, max, step, def) => ({k, l, min, max, step, def});
const SEL = (k, l, opts, def) => ({k, l, opts, def});
const AMT = (d = 0.6, l = 'Сила') => NUM('amt', l, 0, 1, 0.01, d);
function fx(id, name, cat, desc, params, apply){ EFX[id] = {id, name, cat, desc, params, apply, defaults: Object.fromEntries(params.map(p => [p.k, p.def]))}; }
const up = (V, k, x) => { V[k] += x; }, mx = (V, k, x) => { V[k] = Math.max(V[k], x); };
const noise = (t, f) => Math.sin(t * f) + 0.6 * Math.sin(t * f * 1.9 + 1.3);

// ---- camera
fx('push', 'Наезд', 'cam', 'Медленно приближает или отдаляет кадр на протяжении шота.', [AMT(0.5), SEL('out', 'Куда', [[0, 'Вперёд'], [1, 'Назад']], 0)], (V, P, a) => { V.zoom *= 1 + P.amt * 0.2 * (P.out ? 1 - a.p : a.p); });
fx('shake', 'Тряска', 'cam', 'Ручная камера: дрожь, сильнее на ударах.', [AMT(0.4)], (V, P, a) => { const k = 0.4 + a.k * 1.5; up(V, 'panx', noise(a.T, 43) * 0.006 * P.amt * k); up(V, 'pany', noise(a.T + 9, 37) * 0.006 * P.amt * k); up(V, 'rot', noise(a.T, 29) * 0.004 * P.amt * k); V.zoom *= 1 + 0.02 * P.amt; });
fx('roll', 'Крен', 'cam', 'Кадр медленно качается из стороны в сторону.', [AMT(0.3)], (V, P, a) => { up(V, 'rot', P.amt * 0.25 * Math.sin(a.t * 0.8)); V.zoom *= 1 + 0.12 * P.amt; });
fx('punch', 'Удар-зум', 'cam', 'Кадр подпрыгивает на каждом ударе.', [AMT(0.5)], (V, P, a) => { V.zoom *= 1 + P.amt * (0.04 + a.k * 0.14); });
fx('lens', 'Линза', 'cam', 'Бочка, как у широкоугольника или рыбьего глаза.', [AMT(0.4)], (V, P, a) => { up(V, 'bulge', P.amt * 0.5 * (0.6 + a.k)); });
fx('mirror', 'Зеркало', 'cam', 'Кадр отражается: лево-право, четверти или калейдоскоп.', [SEL('mode', 'Тип', [[1, 'Лево-право'], [2, 'Четверти'], [3, 'Калейдоскоп']], 1), NUM('seg', 'Сегментов', 3, 12, 1, 6)], (V, P, a) => { V.mirror = +P.mode; V.kseg = P.seg; if (+P.mode === 3) up(V, 'rot', a.t * 0.08); V.zoom *= 1.08; });
fx('tile', 'Плитка', 'cam', 'Кадр повторяется сеткой маленьких экранов.', [SEL('n', 'Сетка', [[2, '2×2'], [3, '3×3'], [4, '4×4']], 2)], (V, P) => { V.tile = +P.n; });
fx('ripple', 'Волна от удара', 'cam', 'От центра расходится кольцо, как от удара по воде.', [AMT(0.6)], (V, P, a) => { V.rip = Math.max(V.rip, P.amt * (0.5 + a.k * 1.2)); V.ripT = a.ph; });
// ---- distortion
fx('liquid', 'Жидкое стекло', 'dist', 'Картинка преломляет сама себя по яркости, как стекло или вода.', [AMT(0.55)], (V, P, a) => { up(V, 'self', P.amt * (0.03 + 0.06 * a.b)); up(V, 'warp', P.amt * 0.006 * (1 + a.m)); V.warpF = 9; V.warpS = 1.2; V.zoom *= 1.03; });
fx('wave', 'Волна кадра', 'dist', 'Весь кадр идёт синусной волной.', [AMT(0.4), NUM('freq', 'Частота', 2, 40, 1, 12)], (V, P) => { up(V, 'warp', P.amt * 0.02); V.warpF = P.freq; V.warpS = 2; });
fx('parallax', 'Параллакс', 'dist', 'Светлое и тёмное сдвигается на разную глубину: плоское видео становится объёмным.', [AMT(0.55)], (V, P, a) => { up(V, 'par', P.amt * 0.2 * (0.6 + a.b)); V.camx = Math.sin(a.t * 0.6) * 0.9; V.camy = Math.cos(a.t * 0.45) * 0.55; V.zoom *= 1.1; });
fx('slices', 'Срезы', 'dist', 'Горизонтальные полосы сдвигаются, на ударах сильнее.', [AMT(0.5)], (V, P, a) => { mx(V, 'slice', P.amt * (0.05 + 0.2 * a.k)); });
fx('mosh', 'Датамош', 'dist', 'Блоки «залипают» на предыдущем кадре, как битый поток.', [AMT(0.5)], (V, P) => { up(V, 'mosh', P.amt); });
fx('pixelate', 'Мозаика', 'dist', 'Кадр рассыпается на пиксели и собирается на ударе.', [NUM('size', 'Размер', 0.008, 0.1, 0.002, 0.035)], (V, P, a) => { V.pix = P.size * (1 - 0.85 * a.k) + 0.005; });
fx('pixsort', 'Пиксель-стрик', 'dist', 'Светлые пиксели вытягиваются вниз полосами.', [AMT(0.6)], (V, P) => { up(V, 'sort', P.amt); });
fx('zblur', 'Зум-смаз', 'dist', 'Радиальный смаз к центру, будто камеру выстрелили вперёд.', [AMT(0.4)], (V, P, a) => { up(V, 'zb', P.amt * (0.4 + a.k)); });
fx('mblur', 'Смаз движения', 'dist', 'Направленный смаз, как при быстром повороте.', [AMT(0.4), NUM('ang', 'Угол', 0, 3.14, 0.05, 0)], (V, P) => { up(V, 'mb', P.amt * 0.5); V.mba = P.ang; });
fx('tilt', 'Тилт-шифт', 'dist', 'Верх и низ размыты, кадр выглядит как миниатюра.', [AMT(0.6)], (V, P) => { up(V, 'tilt', P.amt); });
// ---- light
fx('glow', 'Свечение', 'light', 'Яркие места светятся, на середине звука сильнее.', [AMT(0.5)], (V, P, a) => { up(V, 'glow', P.amt * (0.6 + 0.8 * a.m)); });
fx('halation', 'Ореол (halation)', 'light', 'Яркие места дают мягкий ореол цвета акцента, как на плёнке.', [AMT(0.55)], (V, P) => { up(V, 'glow', P.amt * 0.9); mx(V, 'gtint', 0.85); });
fx('streak', 'Анаморфный блик', 'light', 'Горизонтальные синие полосы от ярких источников.', [AMT(0.7)], (V, P, a) => { up(V, 'streak', P.amt * (0.7 + a.h)); });
fx('leak', 'Утечки света', 'light', 'Тёплые засветы по краям, как у старой камеры.', [AMT(0.6)], (V, P) => { up(V, 'leak', P.amt); });
fx('burn', 'Киноожог', 'light', 'Оранжево-белые вспышки плёнки слева.', [AMT(0.6)], (V, P) => { up(V, 'burn', P.amt); });
fx('flash', 'Вспышка на бит', 'light', 'Кадр вспыхивает на каждом ударе.', [AMT(0.5)], (V, P, a) => { up(V, 'flash', a.k * P.amt * 0.35); });
fx('strobe', 'Строб-негатив', 'light', 'На сильных ударах цвета на мгновение инвертируются.', [AMT(0.7)], (V, P, a) => { mx(V, 'neg', a.k > 0.55 ? P.amt : 0); });
fx('neon', 'Неон-контуры', 'light', 'Затемняет кадр и подсвечивает контуры цветом палитры.', [AMT(0.9), NUM('dim', 'Затемнение', 0, 1, 0.01, 0.5)], (V, P, a) => { up(V, 'edge', P.amt * (0.8 + 1.2 * a.k)); V.exposure *= 1 - 0.45 * P.dim; V.contrast += 0.2 * P.amt; });
// ---- colour
fx('grade', 'Грейд (кино)', 'color', 'Тени и света подкрашены цветами палитры, лёгкий контраст.', [AMT(0.6)], (V, P) => { up(V, 'tone', P.amt); up(V, 'contrast', 0.12 * P.amt); V.sat *= 1 - 0.06 * P.amt; });
fx('duo', 'Две краски', 'color', 'Весь кадр в двух цветах палитры: тёмный и светлый.', [AMT(0.6)], (V, P) => { mx(V, 'duo', P.amt); });
fx('gmap', 'Градиент палитры', 'color', 'Яркость заменяется градиентом из цветов палитры.', [AMT(0.65)], (V, P) => { mx(V, 'gmap', P.amt); });
fx('hue', 'Сдвиг оттенка', 'color', 'Оттенки поворачиваются по кругу, можно крутить во времени.', [NUM('amt', 'Сдвиг', 0, 1, 0.01, 0.3), NUM('speed', 'Скорость', 0, 1, 0.01, 0)], (V, P, a) => { up(V, 'hue', P.amt * 3.14 + P.speed * a.t * 0.5); });
fx('chrome', 'Хром Y2K', 'color', 'Яркость превращается в жидкий металл, серебро и голубой.', [AMT(0.65)], (V, P) => { mx(V, 'chrome', P.amt); });
fx('thermal', 'Тепловизор', 'color', 'Яркость окрашена как на тепловизоре.', [AMT(1)], (V, P) => { mx(V, 'thermal', P.amt); });
fx('night', 'Ночное видение', 'color', 'Зелёный монохром ночного прицела.', [AMT(1)], (V, P) => { mx(V, 'night', P.amt); });
fx('solar', 'Соляризация', 'color', 'Светлые тона переворачиваются, получается графичный негатив.', [AMT(0.8)], (V, P) => { mx(V, 'solar', P.amt); });
fx('ana', 'Анаглиф 3D', 'color', 'Красно-голубое раздвоение, как в старых 3D-очках.', [AMT(0.5)], (V, P, a) => { up(V, 'ana', P.amt * (0.7 + a.k)); });
fx('rgb', 'RGB-сдвиг', 'color', 'Цветовые каналы расходятся к краям, на ударах сильнее.', [AMT(0.4)], (V, P, a) => { up(V, 'ca', P.amt * (0.006 + 0.025 * a.k)); });
fx('poster', 'Постер', 'color', 'Ограниченное число цветовых уровней.', [NUM('levels', 'Уровней', 2, 10, 1, 5)], (V, P) => { V.post = P.levels; });
fx('bleach', 'Выбеливание', 'color', 'Выцветшие цвета и жёсткий контраст, кино про войну.', [AMT(0.7)], (V, P) => { V.sat *= 1 - 0.6 * P.amt; up(V, 'contrast', 0.35 * P.amt); V.exposure *= 0.96; });
fx('bw', 'Чёрно-белое', 'color', 'Убирает цвет.', [AMT(1)], (V, P) => { V.sat *= 1 - P.amt; });
fx('negative', 'Негатив', 'color', 'Инвертирует цвета.', [AMT(1)], (V, P) => { mx(V, 'neg', P.amt); });
fx('tone', 'Свет и насыщенность', 'color', 'Экспозиция, контраст и насыщенность в одном месте.', [NUM('exp', 'Экспозиция', 0.4, 1.6, 0.01, 1), NUM('con', 'Контраст', 0.6, 1.8, 0.01, 1.1), NUM('sat', 'Насыщенность', 0, 2, 0.01, 1.2)], (V, P) => { V.exposure *= P.exp; V.contrast *= P.con; V.sat *= P.sat; });
// ---- print & graphics
fx('halftone', 'Полутон', 'print', 'Кадр из точек разного размера, как в газете. Краски из палитры.', [NUM('size', 'Размер, px', 4, 24, 1, 10)], (V, P, a) => { V.half = P.size * (1 + 0.3 * a.k); });
fx('riso', 'Ризо (две краски)', 'print', 'Два слоя точек с лёгким смещением, как печать на ризографе.', [NUM('size', 'Размер, px', 4, 20, 1, 8)], (V, P) => { V.riso = P.size; });
fx('dither', 'Дизеринг', 'print', 'Одноцветный кадр из узора точек, цвета из палитры.', [NUM('size', 'Зерно, px', 1, 8, 1, 3)], (V, P) => { V.dith = P.size; });
fx('led', 'LED-экран', 'print', 'Кадр из светящихся пикселей-лампочек.', [NUM('size', 'Размер, px', 5, 24, 1, 10)], (V, P) => { V.led = P.size; });
fx('comic', 'Комикс', 'print', 'Плакатные цвета и чёрные контуры.', [AMT(0.8)], (V, P) => { up(V, 'comic', P.amt); });
fx('sketch', 'Скетч', 'print', 'Рисунок карандашом по контурам, цвета бумаги и туши из палитры.', [AMT(0.9)], (V, P) => { mx(V, 'sketch', P.amt); });
fx('hatch', 'Штриховка', 'print', 'Тёмное закрашено диагональными линиями.', [AMT(0.9)], (V, P) => { mx(V, 'hatch', P.amt); });
fx('glyph', 'ASCII-глифы', 'print', 'Кадр собирается из символов, яркое плотнее.', [AMT(1), NUM('cols', 'Колонок', 30, 220, 5, 110), NUM('vid', 'Видео под ним', 0, 1, 0.05, 0.3)], (V, P, a, C) => { C.L.glyph = P.amt; C.W.gCols = P.cols; V.vidA = Math.min(V.vidA, P.vid); });
fx('plot', 'Плоттер-линии', 'print', 'Волнистые строки: чем темнее, тем гуще волна.', [AMT(1), NUM('lines', 'Линий', 40, 240, 2, 120), NUM('con', 'Контраст', 0.5, 4, 0.05, 1.7), NUM('vid', 'Видео под ним', 0, 1, 0.05, 0.3)], (V, P, a, C) => { C.L.plot = P.amt; C.W.pLines = P.lines; C.W.pCon = P.con; C.W.pCol = C.light; V.vidA = Math.min(V.vidA, P.vid); });
fx('dither2', 'Печать (диффузия)', 'print', 'Тот же узор, но с растекающейся ошибкой (Atkinson, Floyd–Steinberg).', [AMT(1), SEL('algo', 'Алгоритм', [['atkinson', 'Atkinson'], ['fs', 'Floyd–Steinberg'], ['bayer', 'Bayer 4×4'], ['noise', 'Шум']], 'atkinson'), NUM('pitch', 'Зерно, px', 2, 16, 1, 5)], (V, P, a, C) => { C.L.dither = P.amt; C.W.dAlgo = P.algo; C.W.dPitch = P.pitch; V.vidA = 0; });
// ---- film & TV
fx('vhs', 'VHS', 'tv', 'Помехи ленты: дрожь строк, цветовое размазывание, полосы внизу.', [AMT(0.8)], (V, P) => { up(V, 'vhs', P.amt); });
fx('crt', 'CRT-экран', 'tv', 'Выпуклый кинескоп с маской люминофора.', [AMT(0.8)], (V, P) => { mx(V, 'crt', P.amt); up(V, 'scan', 0.25 * P.amt); });
fx('grain', 'Зерно', 'tv', 'Плёночное зерно.', [AMT(0.4)], (V, P) => { up(V, 'grain', P.amt); });
fx('dust', 'Пыль и царапины', 'tv', 'Мелкая пыль, царапины и мерцание старой плёнки.', [AMT(0.6)], (V, P) => { up(V, 'dust', P.amt); });
fx('scan', 'Строчки', 'tv', 'Горизонтальные линии развёртки.', [AMT(0.4)], (V, P) => { up(V, 'scan', P.amt); });
fx('vig', 'Виньетка', 'tv', 'Затемнение по краям.', [AMT(0.5)], (V, P) => { up(V, 'vig', P.amt); });
fx('bars', 'Кино-полосы', 'tv', 'Чёрные полосы сверху и снизу.', [NUM('amt', 'Высота', 0, 0.2, 0.005, 0.1)], (V, P) => { mx(V, 'bars', P.amt); });
fx('echo', 'Эхо-шлейф', 'tv', 'Прошлые кадры тянутся шлейфом и слегка приближаются.', [AMT(0.85), NUM('zoom', 'Тоннель', 1, 1.04, 0.001, 1.012)], (V, P, a) => { mx(V, 'fb', P.amt); V.fbz = P.zoom + 0.012 * a.b; });
fx('camcorder', 'Камкордер REC', 'tv', 'Красная точка REC, таймкод и значок батареи, как на старой цифровой камере.', [AMT(1)], (V, P, a, C) => { C.hud.cam = Math.max(C.hud.cam || 0, P.amt); up(V, 'grain', 0.12); up(V, 'vhs', 0.25 * P.amt); });
// ---- volume & diagrams
fx('cloud', 'Облако точек', 'vol', 'Видео распадается на объёмные точки с цветом картинки. Добавляется светом поверх кадра.',
  [AMT(0.6, 'Яркость'), NUM('depth', 'Глубина', 0, 2.5, 0.05, 1.2), NUM('size', 'Точка', 0.4, 3, 0.05, 1), SEL('color', 'Цвет', [[0, 'Цвет видео'], [4, 'Карта глубины'], [5, 'Палитра']], 5), NUM('orbit', 'Облёт', 0, 1, 0.05, 0.4), NUM('pulse', 'Пульс', 0, 1, 0.05, 0.25), NUM('turb', 'Дрожь', 0, 1, 0.05, 0.2), NUM('burst', 'Разлёт на бит', 0, 1, 0.05, 0.2), NUM('vid', 'Видео под ним', 0, 1, 0.05, 0.4)],
  (V, P, a, C) => { C.L.cloud = P.amt; C.cloud = {depth: P.depth, size: P.size, colorMode: +P.color, orbit: P.orbit, pulse: P.pulse, turb: P.turb, burst: P.burst, depthY: 0.3}; V.vidA = Math.min(V.vidA, P.vid); });
fx('nodes', 'Узлы и фигуры', 'vol', 'Метки на сильнейших контурах кадра: уголки, круги, плюсы.', [AMT(1), NUM('dens', 'Плотность', 30, 300, 10, 90), SEL('shape', 'Форма', [['bracket', 'Уголки'], ['circle', 'Круг'], ['square', 'Квадрат'], ['diamond', 'Ромб'], ['cross', 'Плюс'], ['mixed', 'Смесь']], 'bracket')], (V, P, a, C) => { C.L.nodes = P.amt; C.W.nDens = P.dens; C.W.nShape = P.shape; });
fx('links', 'Связи', 'vol', 'Линии между узлами: сеть Delaunay, соседи, цепочка.', [AMT(1), SEL('mode', 'Способ', [['delaunay', 'Сеть Delaunay'], ['proximity', 'Соседи'], ['chain', 'Цепочка'], ['radial', 'Радиально'], ['hybrid', 'Комбинация']], 'delaunay'), NUM('dist', 'Дистанция', 4, 40, 1, 16)], (V, P, a, C) => { C.L.links = P.amt; C.W.lMode = P.mode; C.W.lDist = P.dist; });
fx('curtain', 'Завеса света', 'vol', 'Цвет сильных контуров вытягивается по вертикали, как светящиеся шторы.', [AMT(0.7), SEL('dir', 'Куда', [['down', 'Вниз'], ['up', 'Вверх'], ['both', 'В обе']], 'down'), NUM('len', 'Длина, %', 10, 80, 1, 40)], (V, P, a, C) => { C.L.curtain = P.amt; C.W.cDir = P.dir; C.W.cLen = P.len; });
fx('track', 'Трек-метки', 'vol', 'Подписанные метки на точках кадра, на биты загораются по очереди.', [NUM('count', 'Количество', 1, 30, 1, 8), SEL('style', 'Вид', [['brackets', 'Уголки'], ['cross', 'Перекрестье'], ['ring', 'Кольцо'], ['square', 'Квадрат'], ['dot', 'Точка']], 'brackets'), SEL('label', 'Подписи', [['xyz', 'Номер + XYZ'], ['num', 'Номер'], ['hex', 'Номер + цвет'], ['none', 'Нет']], 'num')], (V, P, a, C) => { C.W.tCount = P.count; C.W.tStyle = P.style; C.W.tLabel = P.label; });

// ---------------------------------------------------------------- looks: ready-made stacks, the director picks from these and the user can start from them
const L = (id, o) => [id, o || {}];
const PRESETS = {
  film:      {name: 'Кино', fam: 'g', enter: 4, lv: [3, 1.5, 0], stack: [L('grade', {amt: 0.6}), L('push', {amt: 0.5}), L('glow', {amt: 0.15}), L('grain', {amt: 0.35}), L('vig', {amt: 0.5}), L('bars', {amt: 0.095})]},
  dream:     {name: 'Мечта', fam: 'g', enter: 4, lv: [2.5, 1, 0], stack: [L('halation', {amt: 0.8}), L('glow', {amt: 0.5}), L('leak', {amt: 0.55}), L('tilt', {amt: 0.5}), L('push', {amt: 0.3}), L('grain', {amt: 0.2})]},
  y2k:       {name: 'Y2K', fam: 'g', enter: 4, lv: [1.5, 2.5, 1], stack: [L('chrome', {amt: 0.6}), L('streak', {amt: 0.8}), L('glow', {amt: 0.55}), L('rgb', {amt: 0.3}), L('grain', {amt: 0.15})]},
  burnreel:  {name: 'Киноплёнка', fam: 'g', enter: 4, lv: [1, 2, 1], stack: [L('burn', {amt: 0.7}), L('leak', {amt: 0.55}), L('dust', {amt: 0.8}), L('halation', {amt: 0.55}), L('grain', {amt: 0.6}), L('shake', {amt: 0.25})]},
  liquid:    {name: 'Жидкое стекло', fam: 'w', enter: 2, lv: [2.5, 2.5, 1.2], stack: [L('liquid', {amt: 0.6}), L('glow', {amt: 0.4}), L('rgb', {amt: 0.3}), L('vig', {amt: 0.3}), L('roll', {amt: 0.15})]},
  parallax:  {name: 'Параллакс', fam: 'w', enter: 1, lv: [2.5, 2, 0], stack: [L('parallax', {amt: 0.6}), L('grade', {amt: 0.4}), L('glow', {amt: 0.25}), L('vig', {amt: 0.55}), L('grain', {amt: 0.14})]},
  neon:      {name: 'Неон-контур', fam: 'l', enter: 4, lv: [1, 2.5, 2], stack: [L('neon', {amt: 0.9, dim: 0.5}), L('glow', {amt: 0.7}), L('rgb', {amt: 0.3}), L('vig', {amt: 0.5}), L('scan', {amt: 0.12})]},
  echo:      {name: 'Эхо', fam: 'l', enter: 4, lv: [2, 1.5, 1.2], stack: [L('echo', {amt: 0.88}), L('glow', {amt: 0.6}), L('gmap', {amt: 0.3}), L('rgb', {amt: 0.3}), L('vig', {amt: 0.4})]},
  tunnel:    {name: 'Тоннель', fam: 'l', enter: 2, lv: [0, 1.2, 2.5], stack: [L('echo', {amt: 0.9, zoom: 1.025}), L('zblur', {amt: 0.5}), L('hue', {amt: 0.1, speed: 0.4}), L('glow', {amt: 0.6}), L('rgb', {amt: 0.4})]},
  grunge:    {name: 'Гранж', fam: 'v', enter: 3, lv: [0, 2.5, 2], stack: [L('bleach', {amt: 0.6}), L('grain', {amt: 0.8}), L('dust', {amt: 0.8}), L('halation', {amt: 0.5}), L('shake', {amt: 0.4}), L('scan', {amt: 0.2}), L('vig', {amt: 0.7}), L('slices', {amt: 0.15})]},
  vhs:       {name: 'VHS', fam: 'v', enter: 3, lv: [0, 2.5, 1.5], stack: [L('vhs', {amt: 0.8}), L('scan', {amt: 0.3}), L('rgb', {amt: 0.4}), L('grain', {amt: 0.3}), L('camcorder', {amt: 1})]},
  crt:       {name: 'CRT', fam: 'v', enter: 4, lv: [0, 1.5, 1], stack: [L('crt', {amt: 0.85}), L('rgb', {amt: 0.3}), L('glow', {amt: 0.3}), L('grain', {amt: 0.15})]},
  thermal:   {name: 'Тепловизор', fam: 'v', enter: 4, lv: [0, 1.5, 1], stack: [L('thermal', {amt: 1}), L('glow', {amt: 0.3}), L('grain', {amt: 0.3}), L('vig', {amt: 0.5}), L('scan', {amt: 0.15})]},
  night:     {name: 'Ночное видение', fam: 'v', enter: 4, lv: [0, 1.3, 0.8], stack: [L('night', {amt: 1}), L('grain', {amt: 0.5}), L('vig', {amt: 0.7}), L('scan', {amt: 0.2}), L('camcorder', {amt: 0.8})]},
  riso:      {name: 'Ризо', fam: 'p', enter: 3, lv: [0.5, 2, 1.5], stack: [L('riso', {size: 7}), L('grain', {amt: 0.25}), L('push', {amt: 0.3})]},
  halftone:  {name: 'Полутон', fam: 'p', enter: 3, lv: [0, 2, 2.5], stack: [L('halftone', {size: 9}), L('push', {amt: 0.3})]},
  comic:     {name: 'Комикс', fam: 'p', enter: 3, lv: [0, 1.5, 1.5], stack: [L('comic', {amt: 0.85}), L('poster', {levels: 5}), L('tone', {exp: 1, con: 1.1, sat: 1.35})]},
  sketch:    {name: 'Скетч', fam: 'p', enter: 4, lv: [0.5, 1.5, 0.5], stack: [L('sketch', {amt: 0.9}), L('grain', {amt: 0.2})]},
  hatch:     {name: 'Штриховка', fam: 'p', enter: 4, lv: [0, 1.2, 1], stack: [L('hatch', {amt: 0.9}), L('push', {amt: 0.3})]},
  led:       {name: 'LED-экран', fam: 'p', enter: 3, lv: [0, 1, 2], stack: [L('led', {size: 9}), L('glow', {amt: 0.4})]},
  mosaic:    {name: 'Мозаика', fam: 'p', enter: 3, lv: [0, 1.5, 2.5], stack: [L('pixelate', {size: 0.035}), L('poster', {levels: 6}), L('gmap', {amt: 0.4})]},
  plotter:   {name: 'Плоттер', fam: 'p', enter: 1, lv: [0.5, 1.2, 1], stack: [L('plot', {lines: 130})]},
  ascii:     {name: 'ASCII', fam: 'p', enter: 4, lv: [0.5, 1.2, 1.5], stack: [L('glyph', {cols: 110})]},
  mirror:    {name: 'Зеркало', fam: 'k', enter: 2, lv: [1, 1.5, 2.5], stack: [L('mirror', {mode: 1}), L('gmap', {amt: 0.3}), L('rgb', {amt: 0.3}), L('vig', {amt: 0.35})]},
  kaleido:   {name: 'Калейдоскоп', fam: 'k', enter: 2, lv: [0, 1.2, 2.5], stack: [L('mirror', {mode: 3, seg: 8}), L('hue', {amt: 0.2, speed: 0.3}), L('gmap', {amt: 0.35}), L('glow', {amt: 0.3})]},
  drop:      {name: 'Дроп', fam: 'x', enter: 2, lv: [0, 0.5, 3.5], stack: [L('punch', {amt: 0.8}), L('rgb', {amt: 0.8}), L('slices', {amt: 0.7}), L('flash', {amt: 0.6}), L('glow', {amt: 0.8}), L('lens', {amt: 0.4}), L('ripple', {amt: 0.5}), L('echo', {amt: 0.25})]},
  glitch:    {name: 'Рваная лента', fam: 'x', enter: 3, lv: [0, 1.2, 3], stack: [L('slices', {amt: 0.8}), L('mosh', {amt: 0.6}), L('rgb', {amt: 0.8}), L('vhs', {amt: 0.4}), L('scan', {amt: 0.4}), L('grain', {amt: 0.5})]},
  strobe:    {name: 'Строб', fam: 'x', enter: 3, lv: [0, 0.6, 2.5], stack: [L('strobe', {amt: 0.8}), L('punch', {amt: 0.6}), L('rgb', {amt: 0.5}), L('zblur', {amt: 0.4}), L('flash', {amt: 0.5})]},
  shock:     {name: 'Шоковая волна', fam: 'x', enter: 2, lv: [0, 0.8, 2.5], stack: [L('ripple', {amt: 1}), L('lens', {amt: 0.5}), L('rgb', {amt: 0.7}), L('punch', {amt: 0.7}), L('glow', {amt: 0.6})]},
  anaglyph:  {name: '3D-анаглиф', fam: 'x', enter: 3, lv: [0, 1, 2], stack: [L('ana', {amt: 0.7}), L('punch', {amt: 0.5}), L('slices', {amt: 0.3})]},
  pixsort:   {name: 'Пиксель-стрик', fam: 'x', enter: 3, lv: [0, 1.5, 1.5], stack: [L('pixsort', {amt: 0.7}), L('glow', {amt: 0.3}), L('rgb', {amt: 0.3})]},
  volume:    {name: 'Объём', fam: 'o', enter: 1, lv: [2, 1.5, 1], stack: [L('cloud', {amt: 0.55, color: 5}), L('parallax', {amt: 0.3}), L('glow', {amt: 0.3}), L('vig', {amt: 0.4})]},
  blueprint: {name: 'Схема', fam: 'o', enter: 4, lv: [0.8, 1, 0.5], stack: [L('gmap', {amt: 0.85}), L('neon', {amt: 0.7, dim: 0.4}), L('nodes', {dens: 100}), L('links', {mode: 'delaunay'}), L('track', {count: 7, label: 'xyz'})]},
  curtain:   {name: 'Свет', fam: 'o', enter: 4, lv: [1.5, 2, 1.5], stack: [L('curtain', {amt: 0.7}), L('glow', {amt: 0.3}), L('grade', {amt: 0.3})]},
};
// ---- shot stacks -> shader parameters
function stackOf(key){ const pr = PRESETS[key]; return pr.stack.map(([id, p]) => ({id, on: true, p: {...EFX[id].defaults, ...p}})); }
function evalStack(sh, a, pal){
  const V = {...VPD}, C = {L: {}, W: {}, hud: {}, cloud: null, light: pal.lightHex};
  for (const it of sh.stack) { if (it.on === false) continue; const d = EFX[it.id]; if (d) d.apply(V, {...d.defaults, ...it.p}, a, C); }
  return {V, C};
}
function layersOf(sh){ const L2 = {}; for (const it of sh.stack) { if (it.on === false) continue; const d = EFX[it.id]; if (!d) continue; const P = {...d.defaults, ...it.p};
  if (it.id === 'glyph') L2.glyph = P.amt; else if (it.id === 'plot') L2.plot = P.amt; else if (it.id === 'dither2') L2.dither = P.amt; else if (it.id === 'cloud') L2.cloud = P.amt; else if (it.id === 'nodes') L2.nodes = P.amt; else if (it.id === 'links') L2.links = P.amt; else if (it.id === 'curtain') L2.curtain = P.amt; } return L2; }
