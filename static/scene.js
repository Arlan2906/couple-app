/* Рисованные комнаты питомца (SVG 360x230).
   Открытые предметы нарисованы, закрытые — пунктирные метки с замком. */
const SCENE = (() => {
  const seeded = (seed) => { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; };

  const ghost = (x, y) => `
    <g class="ghost" transform="translate(${x} ${y})">
      <circle r="13" fill="rgba(20,10,30,.3)" stroke="#fff" stroke-opacity=".85" stroke-width="1.6" stroke-dasharray="3.5 3"/>
      <rect x="-5" y="-1" width="10" height="8" rx="2" fill="#fff" fill-opacity=".9"/>
      <path d="M-3 -1V-4a3 3 0 0 1 6 0V-1" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="1.8" stroke-linecap="round"/>
    </g>`;

  const common = `
    <defs>
      <radialGradient id="sc-vig" cx="50%" cy="58%" r="78%"><stop offset="62%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".2"/></radialGradient>
      <linearGradient id="sc-fshade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".2"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
      <linearGradient id="sc-beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".34"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <radialGradient id="sc-glow"><stop offset="0" stop-color="#FFE9A8" stop-opacity=".75"/><stop offset="1" stop-color="#FFE9A8" stop-opacity="0"/></radialGradient>
    </defs>`;

  const tail = (night, tint = "#141a4a") =>
    `<ellipse cx="180" cy="212" rx="34" ry="5" fill="rgba(0,0,0,.22)"/>
     <rect width="360" height="230" fill="url(#sc-vig)"/>
     ${night ? `<rect width="360" height="230" fill="${tint}" opacity=".26"/>` : ""}`;

  const windowSvg = (x, y, w, h, night, curtains = true) => {
    const stars = night
      ? [[.22, .2], [.7, .14], [.45, .5], [.82, .62], [.3, .78], [.6, .8]].map(([a, b], i) =>
          `<circle class="tw" style="animation-delay:${i * .5}s" cx="${(x + 4 + (w - 8) * a).toFixed(1)}" cy="${(y + 4 + (h - 8) * b).toFixed(1)}" r="1.3" fill="#fff"/>`).join("")
        + `<g transform="translate(${x + w * .68} ${y + h * .27})"><path d="M0 -7A7 7 0 1 0 7 3A5.6 5.6 0 1 1 0 -7Z" fill="#FFF3C4"/></g>`
      : `<g class="cloud-slow"><ellipse cx="${x + w * .34}" cy="${y + h * .3}" rx="10" ry="4" fill="#fff" opacity=".95"/><ellipse cx="${x + w * .5}" cy="${y + h * .25}" rx="7" ry="4.6" fill="#fff" opacity=".95"/></g>
         <circle cx="${x + w * .78}" cy="${y + h * .22}" r="5" fill="#FFE27A"/>`;
    const hills = `<path d="M${x + 3} ${y + h - 3} Q${x + w * .3} ${y + h * .62} ${x + w * .55} ${y + h * .78} T${x + w - 3} ${y + h * .7} V${y + h - 3}Z" fill="${night ? "#1a2150" : "#9ADB8A"}"/>`;
    return `
      <g>
        <rect x="${x - 4}" y="${y - 4}" width="${w + 8}" height="${h + 8}" rx="5" fill="#FBF3EA" stroke="#D3BBA6" stroke-width="1.2"/>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="url(#${night ? "sc-skyn" : "sc-skyd"})"/>
        <defs>
          <linearGradient id="sc-skyd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#86C7FF"/><stop offset="1" stop-color="#E2F5FF"/></linearGradient>
          <linearGradient id="sc-skyn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1B2354"/><stop offset="1" stop-color="#3E4690"/></linearGradient>
        </defs>
        ${stars}${hills}
        <path d="M${x + 4} ${y + h - 4} L${x + w * .55} ${y + 4}" stroke="#fff" stroke-opacity=".14" stroke-width="9"/>
        <rect x="${x + w / 2 - 1.5}" y="${y}" width="3" height="${h}" fill="#FBF3EA"/>
        <rect x="${x}" y="${y + h / 2 - 1.5}" width="${w}" height="3" fill="#FBF3EA"/>
        <rect x="${x - 7}" y="${y + h + 2}" width="${w + 14}" height="5" rx="2" fill="#F4E7D8" stroke="#D3BBA6" stroke-width=".8"/>
        ${curtains ? `
        <path d="M${x - 14} ${y - 10} h8 q6 ${h * .4} 2 ${h + 14} h-10z" fill="#F4A6B8"/>
        <path d="M${x + w + 14} ${y - 10} h-8 q-6 ${h * .4} -2 ${h + 14} h10z" fill="#F4A6B8"/>
        <path d="M${x - 10} ${y - 8} q3 ${h * .5} 1 ${h + 10}M${x + w + 10} ${y - 8} q-3 ${h * .5} -1 ${h + 10}" stroke="#E08AA0" stroke-width="1.2" fill="none"/>
        <rect x="${x - 20}" y="${y - 14}" width="${w + 40}" height="3.5" rx="1.7" fill="#8A5A3C"/>` : ""}
      </g>`;
  };

  /* ---------- Гостиная ---------- */
  function living(c) {
    const { has, night, frames, photo } = c;
    const frameSlots = [30, 72, 114].map((fx, i) => {
      const f = frames[i];
      if (!f || !f.unlocked) return `<g>${ghost(fx + 17, 58, "#a98d86")}</g>`;
      const img = f.photo
        ? `<image href="${photo(f.photo)}" x="${fx + 3}" y="37" width="28" height="38" preserveAspectRatio="xMidYMid slice"/>`
        : `<rect x="${fx + 3}" y="37" width="28" height="38" fill="#FDF0D0"/><path d="M${fx + 3} 70 q7 -12 14 -4 t14 -6 V75 H${fx + 3}z" fill="#9AD08A"/><circle cx="${fx + 24}" cy="46" r="4" fill="#FFC94D"/>`;
      return `<g class="frame-g"><rect x="${fx + 1}" y="35" width="32" height="42" fill="#fff"/>${img}
        <rect x="${fx}" y="34" width="34" height="44" fill="none" stroke="#8A5A3C" stroke-width="3.2"/>
        <rect x="${fx + 2}" y="36" width="30" height="40" fill="none" stroke="#fff" stroke-opacity=".35"/>
        <path d="M${fx + 17} 34 L${fx + 17} 28" stroke="#6b4a33" stroke-width="1"/></g>`;
    }).join("");

    const sofa = `
      <ellipse cx="84" cy="152" rx="72" ry="5" fill="rgba(0,0,0,.2)"/>
      <rect x="22" y="86" width="124" height="48" rx="16" fill="#E2708C"/>
      <rect x="26" y="90" width="116" height="10" rx="5" fill="#fff" opacity=".12"/>
      <rect x="38" y="92" width="42" height="34" rx="11" fill="#F2899F"/>
      <rect x="84" y="92" width="42" height="34" rx="11" fill="#F2899F"/>
      <path d="M59 96v26M105 96v26" stroke="#E2708C" stroke-width="1.2" opacity=".6"/>
      <rect x="16" y="112" width="136" height="30" rx="11" fill="#EE7F98"/>
      <rect x="16" y="112" width="136" height="9" rx="6" fill="#fff" opacity=".13"/>
      <path d="M44 128h26M98 128h26" stroke="#CF5C79" stroke-width="1.3" stroke-linecap="round" opacity=".6"/>
      <rect x="9" y="98" width="24" height="46" rx="11" fill="#DC6683"/>
      <rect x="135" y="98" width="24" height="46" rx="11" fill="#DC6683"/>
      <rect x="14" y="140" width="6" height="10" rx="2" fill="#6B452B"/><rect x="148" y="140" width="6" height="10" rx="2" fill="#6B452B"/>
      <g transform="rotate(-14 130 112)"><rect x="118" y="100" width="22" height="22" rx="7" fill="#FFD27A"/><path d="M122 104l14 14M136 104l-14 14" stroke="#F0AE3A" stroke-width="1.2"/></g>
      <path d="M26 118c14-8 26 6 40 -2" stroke="#fff" stroke-opacity=".5" stroke-width="5" fill="none" stroke-linecap="round" opacity="0"/>`;

    const lamp = has("lamp") ? `
      <g>
        <circle class="lamp-glow" cx="166" cy="76" r="${night ? 56 : 36}" fill="url(#sc-glow)" opacity="${night ? 1 : .6}"/>
        <ellipse cx="166" cy="150" rx="10" ry="3" fill="#3f322d"/>
        <rect x="165" y="84" width="2.4" height="66" fill="#6B5A52"/>
        <path d="M153 84 L179 84 L172 62 L160 62Z" fill="#FFE29A"/>
        <path d="M153 84 L179 84 L176 78 L156 78Z" fill="#F4C96B"/>
        <ellipse cx="166" cy="62" rx="6" ry="1.6" fill="#FFF3C9"/>
      </g>` : ghost(166, 98);

    const plant = has("plant") ? `
      <g class="sway" style="transform-origin:342px 196px">
        ${[[-58, 1.5], [-34, 1.8], [-10, 1.9], [14, 1.7], [38, 1.8], [60, 1.4]].map(([a, s], i) =>
          `<g transform="translate(342 196) rotate(${a}) scale(${s})"><path d="M0 0C-9 -12 -8 -32 0 -44C8 -32 9 -12 0 0Z" fill="${i % 2 ? "#3F9A60" : "#58B573"}"/><path d="M0 0V-38" stroke="#2D7B49" stroke-width=".8"/></g>`).join("")}
      </g>
      <path d="M326 192h32l-4 28h-24z" fill="#C97B4A"/><rect x="323" y="188" width="38" height="8" rx="3" fill="#DE9560"/><path d="M330 204h24" stroke="#fff" stroke-opacity=".25" stroke-width="2"/>` : ghost(342, 176);

    const tvUnit = `
      <rect x="258" y="130" width="72" height="22" rx="3" fill="#8A5A3C"/>
      <rect x="260" y="132" width="34" height="18" rx="2" fill="#9B6848"/><rect x="296" y="132" width="32" height="18" rx="2" fill="#9B6848"/>
      <circle cx="277" cy="141" r="1.5" fill="#E8C8A0"/><circle cx="312" cy="141" r="1.5" fill="#E8C8A0"/>
      <rect x="262" y="151" width="4" height="5" fill="#5e3d27"/><rect x="322" y="151" width="4" height="5" fill="#5e3d27"/>`;
    const tv = has("tv") ? `
      <rect x="262" y="94" width="64" height="36" rx="3" fill="#1D1E25"/>
      <rect x="265" y="97" width="58" height="30" rx="1.5" fill="url(#sc-tvs)"/>
      <defs><linearGradient id="sc-tvs" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4C5C9E"/><stop offset="1" stop-color="#C98CC8"/></linearGradient></defs>
      <path d="M268 124 L292 100" stroke="#fff" stroke-opacity=".22" stroke-width="7"/>
      <path d="M270 120q8-14 16-4t14-8t16 -4" stroke="#fff" stroke-opacity=".5" stroke-width="1.6" fill="none"/>
      <rect x="288" y="130" width="12" height="2" fill="#333"/>` : ghost(294, 112);

    const yarn = has("rug") ? `
      <g class="bob" style="transform-origin:262px 206px">
        <path d="M252 208 C 238 214, 232 200, 214 208 S 196 216, 190 208" stroke="#F26D8D" stroke-width="2" fill="none" stroke-linecap="round" opacity=".9"/>
        <circle cx="262" cy="204" r="11" fill="#F26D8D"/>
        <path d="M253 200c6 -4 14 -3 18 3M252 206c8 -2 14 0 19 5M258 195c3 3 4 8 3 13" stroke="#FFB3C6" stroke-width="1.5" fill="none" stroke-linecap="round"/>
        <ellipse cx="262" cy="214" rx="10" ry="2" fill="rgba(0,0,0,.12)"/>
      </g>` : ghost(262, 204);

    return `
      <defs>
        <linearGradient id="lv-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFEFE4"/><stop offset="1" stop-color="#F7D2BE"/></linearGradient>
        <linearGradient id="lv-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D9A56F"/><stop offset="1" stop-color="#BD8453"/></linearGradient>
        <pattern id="lv-stripe" width="26" height="10" patternUnits="userSpaceOnUse"><rect width="13" height="10" fill="#fff" opacity=".3"/></pattern>
      </defs>
      <rect width="360" height="150" fill="url(#lv-wall)"/>
      <rect width="360" height="104" fill="url(#lv-stripe)"/>
      <rect y="104" width="360" height="42" fill="#F3D3C1"/>
      ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => `<rect x="${6 + i * 30}" y="114" width="22" height="26" rx="2" fill="none" stroke="#E5BBA5" stroke-width="1.2"/>`).join("")}
      <rect y="102" width="360" height="5" fill="#FFF7F0"/><rect y="107" width="360" height="2" fill="rgba(0,0,0,.07)"/>
      <rect y="144" width="360" height="8" fill="#FFF7F0"/>
      <rect y="150" width="360" height="80" fill="url(#lv-floor)"/>
      ${[162, 177, 194, 213].map((y) => `<path d="M0 ${y}H360" stroke="rgba(90,50,20,.22)" stroke-width="1"/>`).join("")}
      ${[[40, 150, 162], [150, 150, 162], [260, 150, 162], [90, 162, 177], [210, 162, 177], [320, 162, 177], [20, 177, 194], [130, 177, 194], [250, 177, 194], [340, 177, 194], [70, 194, 213], [180, 194, 213], [300, 194, 213]].map(([x, a, b]) => `<path d="M${x} ${a}V${b}" stroke="rgba(90,50,20,.18)"/>`).join("")}
      <rect y="150" width="360" height="14" fill="url(#sc-fshade)"/>
      ${night ? "" : `<path d="M204 96 L260 96 L330 224 L226 224Z" fill="url(#sc-beam)" opacity=".7"/>`}
      ${windowSvg(206, 30, 52, 62, night)}
      ${frameSlots}
      <ellipse cx="180" cy="204" rx="92" ry="19" fill="#F3C7A6"/>
      <ellipse cx="180" cy="204" rx="92" ry="19" fill="none" stroke="#E39A7C" stroke-width="2.4"/>
      <ellipse cx="180" cy="204" rx="74" ry="14.5" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.4" stroke-dasharray="4 4"/>
      ${sofa}${lamp}${tvUnit}${tv}${yarn}${plant}
      ${tail(night)}`;
  }

  /* ---------- Кухня ---------- */
  function kitchen(c) {
    const { has, night } = c;
    const coffee = has("coffee") ? `
      <g>
        <rect x="18" y="66" width="38" height="32" rx="5" fill="#33333D"/>
        <rect x="18" y="66" width="38" height="9" rx="4" fill="#4B4B58"/>
        <rect x="26" y="80" width="22" height="3" rx="1.5" fill="#1B1B21"/>
        <circle cx="48" cy="71" r="1.8" fill="#FF5C5C"/>
        <rect x="27" y="87" width="20" height="11" fill="#1B1B21"/>
        <path d="M30 92h14v6H30z" fill="#fff"/><path d="M44 93q5 0 5 3t-5 2" stroke="#fff" stroke-width="1.6" fill="none"/>
        <g class="steam"><path d="M34 86q-3-5 0-8t0-6" stroke="#fff" stroke-opacity=".8" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M40 86q-3-5 0-8t0-6" stroke="#fff" stroke-opacity=".8" stroke-width="1.6" fill="none" stroke-linecap="round"/></g>
      </g>` : ghost(36, 82);
    const pizza = has("pizza") ? `
      <g>
        <rect x="88" y="94" width="42" height="5" rx="2" fill="#B9834F"/>
        <circle cx="109" cy="76" r="21" fill="#E3A957"/><circle cx="109" cy="76" r="17" fill="#F7D56F"/>
        ${[[102, 70], [114, 68], [108, 82], [118, 79], [100, 80]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.4" fill="#D8493C"/>`).join("")}
        <path d="M104 74q2 -4 6 -2M112 84q4 0 5 -3" stroke="#3F9A60" stroke-width="1.5" fill="none" stroke-linecap="round"/>
        <path d="M109 76L109 55M109 76L126 86" stroke="#E3A957" stroke-width="1" opacity=".7"/>
      </g>` : ghost(109, 76);
    const teapot = has("teapot") ? `
      <g>
        <g class="steam"><path d="M285 150q-3-5 0-8t0-6" stroke="#9aa" stroke-opacity=".8" stroke-width="1.5" fill="none" stroke-linecap="round"/></g>
        <ellipse cx="286" cy="171" rx="13" ry="3" fill="rgba(0,0,0,.15)"/>
        <ellipse cx="286" cy="162" rx="12" ry="10" fill="#6AA8D8"/><path d="M276 160q10 3 20 0" stroke="#fff" stroke-opacity=".55" stroke-width="2" fill="none"/>
        <rect x="280" y="150" width="12" height="3" rx="1.5" fill="#5390C0"/><circle cx="286" cy="149" r="2" fill="#5390C0"/>
        <path d="M298 160q8 -2 7 -9l-4 1q1 4 -4 6z" fill="#6AA8D8"/><path d="M274 156q-9 0 -7 9q2 3 7 2" stroke="#5390C0" stroke-width="2.2" fill="none"/>
      </g>` : ghost(286, 160);
    const cupcake = has("cupcake") ? `
      <g>
        <path d="M313 164h18l-2.5 11h-13z" fill="#F28FA5"/><path d="M316 164v11M320 164v11M324 164v11M328 164v11" stroke="#E5708A" stroke-width=".8"/>
        <path d="M312 164q1 -6 8 -6q-2 -5 4 -7q-1 -5 6 -4q-1 4 2 6q4 3 1 11z" fill="#FFE0E8"/>
        <circle cx="323" cy="148" r="3" fill="#D8493C"/><path d="M323 145q1 -3 4 -4" stroke="#3F7D4E" stroke-width="1.2" fill="none"/>
      </g>` : ghost(322, 158);

    return `
      <defs>
        <linearGradient id="kt-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E9F7F0"/><stop offset="1" stop-color="#D0EBDD"/></linearGradient>
        <pattern id="kt-tile" width="24" height="12" patternUnits="userSpaceOnUse"><rect width="24" height="12" fill="#F6FBF8"/><path d="M0 .5H24M0 6.5H24M12 .5V6.5M0 6.5V12M24 6.5V12" stroke="#C4DDD0" stroke-width="1"/></pattern>
        <pattern id="kt-floor" width="28" height="28" patternUnits="userSpaceOnUse"><rect width="28" height="28" fill="#F4F3EC"/><rect width="14" height="14" fill="#BFD0C8"/><rect x="14" y="14" width="14" height="14" fill="#BFD0C8"/></pattern>
        <linearGradient id="kt-fr" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#F0F2F5"/><stop offset="1" stop-color="#D4D9E0"/></linearGradient>
      </defs>
      <rect width="360" height="150" fill="url(#kt-wall)"/>
      <rect y="62" width="360" height="88" fill="url(#kt-tile)"/>
      <rect y="60" width="360" height="4" fill="#fff"/>
      <rect y="150" width="360" height="80" fill="url(#kt-floor)"/>
      <rect y="150" width="360" height="16" fill="url(#sc-fshade)"/>
      <rect y="146" width="360" height="5" fill="#E8EEEA"/>
      ${night ? "" : `<path d="M208 92 L262 92 L330 224 L226 224Z" fill="url(#sc-beam)" opacity=".5"/>`}
      <!-- верхние шкафчики -->
      <rect x="10" y="12" width="132" height="44" rx="3" fill="#F7F3EA" stroke="#D9D2C2"/>
      ${[0, 1, 2].map((i) => `<rect x="${14 + i * 43}" y="16" width="39" height="36" rx="2" fill="#FBF8F1" stroke="#E0D9C9"/><rect x="${14 + i * 43 + 16}" y="46" width="8" height="2.5" rx="1.2" fill="#B59F7A"/>`).join("")}
      <!-- нижние шкафчики и столешница -->
      <rect x="0" y="104" width="148" height="46" fill="#6FB7A5"/>
      ${[0, 1, 2].map((i) => `<rect x="${4 + i * 48}" y="108" width="44" height="38" rx="2" fill="#7CC4B2" stroke="#5CA290"/><circle cx="${26 + i * 48}" cy="118" r="1.8" fill="#EAD9B0"/>`).join("")}
      <rect x="-4" y="98" width="156" height="8" rx="2" fill="#F3EFE7"/><rect x="-4" y="104" width="156" height="2" fill="rgba(0,0,0,.1)"/>
      <rect x="2" y="148" width="144" height="4" fill="#4E9A88"/>
      <!-- холодильник -->
      <rect x="154" y="36" width="40" height="114" rx="4" fill="url(#kt-fr)" stroke="#B9C1CC"/>
      <path d="M154 70H194" stroke="#B9C1CC" stroke-width="1.4"/>
      <rect x="187" y="42" width="2.6" height="22" rx="1.3" fill="#8A93A0"/><rect x="187" y="78" width="2.6" height="34" rx="1.3" fill="#8A93A0"/>
      <rect x="162" y="48" width="12" height="14" fill="#FFF" stroke="#E5E8EE"/><path d="M168 58l-3 -3a2 2 0 0 1 3 -3a2 2 0 0 1 3 3z" fill="#FF6F8E"/>
      <circle cx="176" cy="92" r="3" fill="#F2B84B"/><circle cx="168" cy="100" r="3" fill="#4EA6E0"/>
      ${windowSvg(212, 30, 50, 56, night, false)}
      <rect x="208" y="82" width="58" height="3" fill="none"/>
      <g><rect x="228" y="76" width="18" height="10" rx="2" fill="#C97B4A"/><path d="M232 76q-2 -8 2 -10q2 4 2 10M240 76q2 -8 6 -9q0 5 -2 9" fill="#58B573"/></g>
      <!-- часы -->
      <circle cx="298" cy="40" r="15" fill="#fff" stroke="#8A5A3C" stroke-width="3"/>
      <path d="M298 40V31M298 40L304 44" stroke="#33333D" stroke-width="1.8" stroke-linecap="round"/><circle cx="298" cy="40" r="1.6" fill="#33333D"/>
      ${[0, 90, 180, 270].map((a) => `<path d="M298 27.5V30" stroke="#999" stroke-width="1" transform="rotate(${a} 298 40)"/>`).join("")}
      <!-- полка с баночками -->
      <rect x="276" y="76" width="70" height="4" rx="1.5" fill="#B9834F"/>
      <rect x="282" y="62" width="12" height="14" rx="2" fill="#F5E6C8" stroke="#D2BE92"/><rect x="298" y="64" width="12" height="12" rx="2" fill="#E9B8A8"/><rect x="314" y="60" width="13" height="16" rx="2" fill="#B8D8C4"/><rect x="331" y="66" width="11" height="10" rx="2" fill="#F2D482"/>
      ${coffee}${pizza}
      <!-- коврик-дорожка, миска -->
      <rect x="12" y="176" width="112" height="22" rx="6" fill="#F2B5A7"/>
      ${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${18 + i * 18}" y="176" width="8" height="22" fill="#fff" opacity=".35"/>`).join("")}
      <g><ellipse cx="136" cy="209" rx="14" ry="4" fill="rgba(0,0,0,.14)"/><path d="M123 198h26l-3 10h-20z" fill="#5E9BE0"/><ellipse cx="136" cy="198" rx="13" ry="3.4" fill="#7FB4EE"/><ellipse cx="136" cy="198" rx="9" ry="2" fill="#B07A4A"/></g>
      <!-- стол -->
      <rect x="302" y="184" width="8" height="28" fill="#8A5A3C"/>
      <ellipse cx="306" cy="213" rx="22" ry="5" fill="#8A5A3C"/>
      <ellipse cx="306" cy="171" rx="48" ry="12" fill="#E9C9A0"/>
      <ellipse cx="306" cy="168" rx="48" ry="12" fill="#FFF3E2"/>
      <ellipse cx="306" cy="168" rx="48" ry="12" fill="none" stroke="#F0B6BE" stroke-width="2.4" stroke-dasharray="6 5"/>
      <path d="M262 170q4 8 8 0t8 0t8 0t8 0t8 0t8 0t8 0t8 0t8 0t8 0t8 0" stroke="#F4A6B0" stroke-width="0" fill="none"/>
      ${teapot}${cupcake}
      ${tail(night, "#102a3a")}`;
  }

  /* ---------- Сад ---------- */
  function garden(c) {
    const { has, night } = c;
    const rand = seeded(7);
    const tufts = Array.from({ length: 26 }, () => {
      const x = 8 + rand() * 344, y = 134 + rand() * 90;
      return `<path d="M${x.toFixed(0)} ${y.toFixed(0)}l-2.4 -6M${x.toFixed(0)} ${y.toFixed(0)}v-8M${x.toFixed(0)} ${y.toFixed(0)}l2.4 -6" stroke="${night ? "#2E6B4A" : "#4E9E48"}" stroke-width="1.4" stroke-linecap="round"/>`;
    }).join("");
    const daisies = [[86, 196], [128, 214], [214, 178], [250, 150], [330, 140], [20, 190], [300, 218]].map(([x, y]) =>
      `<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-3" rx="1.6" ry="2.6" fill="#fff" transform="rotate(${a})"/>`).join("")}<circle r="1.5" fill="#FFC94D"/></g>`).join("");

    const tree = has("tree") ? `
      <g>
        <ellipse cx="46" cy="158" rx="40" ry="7" fill="rgba(0,0,0,.16)"/>
        <path d="M39 156 Q41 118 40 84 H54 Q53 118 55 156Z" fill="#8B5A36"/><path d="M45 100l-8 -6M49 118l8 -7" stroke="#6E4527" stroke-width="2.4" stroke-linecap="round"/>
        <g class="sway" style="transform-origin:46px 90px">
          <circle cx="22" cy="72" r="24" fill="#3F9650"/><circle cx="70" cy="70" r="24" fill="#3F9650"/><circle cx="46" cy="90" r="22" fill="#47A558"/>
          <circle cx="46" cy="50" r="28" fill="#55B866"/><circle cx="28" cy="62" r="22" fill="#4EAE5C"/><circle cx="64" cy="60" r="22" fill="#4EAE5C"/>
          <circle cx="38" cy="44" r="12" fill="#6CCB78" opacity=".7"/>
          ${[[30, 70], [58, 52], [66, 74], [44, 80], [20, 52]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.2" fill="#E24A3C"/><circle cx="${x - 1}" cy="${y - 1}" r=".9" fill="#fff" opacity=".7"/>`).join("")}
        </g>
      </g>` : ghost(46, 96);
    const tent = has("tent") ? `
      <g>
        <ellipse cx="146" cy="162" rx="44" ry="6" fill="rgba(0,0,0,.14)"/>
        <path d="M102 160 L146 106 L190 160Z" fill="#F2A65A"/>
        <path d="M146 106 L190 160 L166 160Z" fill="#E08E3F"/>
        <path d="M130 160 L146 124 L162 160Z" fill="#4B3023"/>
        <path d="M146 124 L146 160" stroke="#3a2418" stroke-width="1"/>
        <path d="M118 140 L146 112 M174 140 L146 112" stroke="#fff" stroke-opacity=".5" stroke-width="2" stroke-dasharray="4 3"/>
        <path d="M146 106V92" stroke="#6B452B" stroke-width="1.6"/><path d="M146 92l16 4 -16 5z" fill="#E24A5E"/>
        <path d="M102 160 L88 168M190 160 L204 168" stroke="#8a7a60" stroke-width="1"/>
        <circle cx="88" cy="168" r="1.6" fill="#6B452B"/><circle cx="204" cy="168" r="1.6" fill="#6B452B"/>
      </g>` : ghost(146, 138);
    const fountain = has("fountain") ? `
      <g>
        <ellipse cx="314" cy="198" rx="36" ry="10" fill="rgba(0,0,0,.14)"/>
        <ellipse cx="314" cy="190" rx="34" ry="10" fill="#C9CED8"/><ellipse cx="314" cy="188" rx="30" ry="8" fill="#8ED2F3"/>
        <path d="M280 190v-4q0 -8 34 -8t34 8v4" fill="none"/>
        <rect x="309" y="160" width="10" height="28" fill="#B7BDC9"/>
        <ellipse cx="314" cy="160" rx="17" ry="5" fill="#C9CED8"/><ellipse cx="314" cy="159" rx="14" ry="3.6" fill="#8ED2F3"/>
        <g class="jet"><path d="M314 158V138" stroke="#CFEFFF" stroke-width="2.4" stroke-linecap="round"/><path d="M314 140q-10 -2 -14 18M314 140q10 -2 14 18" stroke="#CFEFFF" stroke-width="1.8" fill="none" stroke-linecap="round"/></g>
        <circle class="drop" cx="300" cy="170" r="1.6" fill="#CFEFFF"/><circle class="drop d2" cx="328" cy="170" r="1.6" fill="#CFEFFF"/>
      </g>` : ghost(314, 172);
    const tulips = has("tulip") ? `
      <g>
        <ellipse cx="258" cy="216" rx="34" ry="8" fill="#8a5a3a"/><ellipse cx="258" cy="214" rx="32" ry="6.5" fill="#9b6845"/>
        ${[[240, 190, "#E24A5E"], [248, 184, "#FFC94D"], [257, 188, "#F27FB6"], [266, 182, "#B58CE8"], [275, 189, "#E24A5E"], [283, 192, "#FFC94D"]].map(([x, y, col], i) => `
          <g class="sway" style="transform-origin:${x}px 214px;animation-delay:${i * .3}s"><path d="M${x} 214V${y + 6}" stroke="#3F9A60" stroke-width="2"/><path d="M${x} 206q-8 -2 -9 -9q6 1 9 9" fill="#58B573"/>
          <path d="M${x - 5} ${y + 4}q0 -9 5 -10q5 1 5 10q-5 4 -10 0z" fill="${col}"/><path d="M${x - 2} ${y - 5}l2 4l2 -4" fill="${col}" stroke="${col}"/></g>`).join("")}
      </g>` : ghost(258, 198);
    const kite = has("kite") ? `
      <g class="kite" style="transform-origin:250px 62px">
        <path d="M252 72 Q 232 100 212 138" stroke="#6b5b53" stroke-width="1" fill="none"/>
        <g transform="rotate(-18 250 52)">
          <path d="M250 28 L270 52 L250 84 L230 52Z" fill="#F2557A"/>
          <path d="M250 28 L270 52 L250 52Z" fill="#FFC94D"/><path d="M250 84 L230 52 L250 52Z" fill="#4EA6E0"/>
          <path d="M250 28V84M230 52H270" stroke="#fff" stroke-opacity=".7" stroke-width="1"/>
          <path d="M250 84 q-6 8 0 14 t0 14 t-2 12" stroke="#6b5b53" stroke-width="1.2" fill="none"/>
          <path d="M248 96l-6 -3 1 7zM252 110l6 -3 -1 7z" fill="#F2557A"/>
        </g>
      </g>` : ghost(250, 52);

    const skyTop = night ? "#141c4d" : "#79C6FF", skyBot = night ? "#3b4285" : "#E3F6FF";
    return `
      <defs>
        <linearGradient id="gd-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${skyTop}"/><stop offset="1" stop-color="${skyBot}"/></linearGradient>
        <linearGradient id="gd-lawn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${night ? "#2F7A52" : "#A5DF86"}"/><stop offset="1" stop-color="${night ? "#1F5A3E" : "#62B955"}"/></linearGradient>
        <pattern id="gd-mow" width="44" height="44" patternUnits="userSpaceOnUse" patternTransform="skewX(-24)"><rect width="22" height="44" fill="#fff" opacity=".07"/></pattern>
      </defs>
      <rect width="360" height="170" fill="url(#gd-sky)"/>
      ${night
        ? `${Array.from({ length: 18 }, (_, i) => `<circle class="tw" style="animation-delay:${(i % 7) * .45}s" cx="${(i * 53 + 17) % 350}" cy="${(i * 29 + 9) % 90 + 6}" r="${i % 3 ? 1.1 : 1.7}" fill="#fff"/>`).join("")}
           <g transform="translate(300 34)"><circle r="15" fill="#FFF3C4"/><circle cx="6" cy="-3" r="12.5" fill="#262f6e"/></g>`
        : `<g transform="translate(304 38)"><circle r="28" fill="#FFE9A0" opacity=".35"/><circle r="19" fill="#FFE27A"/><g class="spin">${Array.from({ length: 10 }, (_, i) => `<path d="M0 -24V-31" stroke="#FFD24D" stroke-width="2.4" stroke-linecap="round" transform="rotate(${i * 36})"/>`).join("")}</g></g>
           <g class="cloud-a"><ellipse cx="70" cy="40" rx="24" ry="8" fill="#fff"/><ellipse cx="88" cy="34" rx="14" ry="9" fill="#fff"/><ellipse cx="56" cy="35" rx="12" ry="7" fill="#fff"/></g>
           <g class="cloud-b"><ellipse cx="180" cy="62" rx="20" ry="6.5" fill="#fff" opacity=".9"/><ellipse cx="194" cy="57" rx="11" ry="7" fill="#fff" opacity=".9"/></g>
           <path class="bird" d="M120 30q4 -5 8 0q4 -5 8 0" stroke="#4a5568" stroke-width="1.5" fill="none" stroke-linecap="round"/>
           <path class="bird b2" d="M138 44q3 -4 6 0q3 -4 6 0" stroke="#4a5568" stroke-width="1.3" fill="none" stroke-linecap="round"/>`}
      <path d="M0 126 Q60 96 130 120 T260 112 T360 118 V150 H0Z" fill="${night ? "#1f4a46" : "#B4E1A0"}"/>
      <path d="M0 136 Q80 112 170 134 T360 128 V160 H0Z" fill="${night ? "#245a4a" : "#93D285"}"/>
      <!-- забор -->
      <rect y="124" width="360" height="3.5" fill="${night ? "#c9c3d6" : "#fff"}"/><rect y="138" width="360" height="3.5" fill="${night ? "#c9c3d6" : "#fff"}"/>
      ${Array.from({ length: 26 }, (_, i) => `<path d="M${i * 14 + 2} 154V122l5 -5l5 5V154z" fill="${night ? "#d7d2e4" : "#FFFDF8"}" stroke="${night ? "#a39db8" : "#E3DCCB"}" stroke-width=".8"/>`).join("")}
      <rect y="152" width="360" height="78" fill="url(#gd-lawn)"/>
      <rect y="152" width="360" height="78" fill="url(#gd-mow)"/>
      <rect y="152" width="360" height="10" fill="url(#sc-fshade)"/>
      <!-- дорожка из камней -->
      ${[[184, 214, 24, 7], [190, 198, 20, 6], [176, 186, 17, 5], [182, 175, 14, 4.2], [178, 166, 11, 3.4]].map(([x, y, rx, ry]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${night ? "#7b8090" : "#D7D3C8"}" stroke="${night ? "#5f6475" : "#B9B3A5"}"/>`).join("")}
      ${tufts}${daisies}
      ${kite}${tree}${tent}${fountain}${tulips}
      ${tail(night, "#0a1040")}`;
  }

  /* ---------- Чердак ---------- */
  function attic(c) {
    const { has } = c;
    const rand = seeded(11);
    const bulbs = (path, n, off) => Array.from({ length: n }, (_, i) => {
      const t = (i + 0.5) / n;
      return `<circle class="bulb" style="animation-delay:${((i + off) % 5) * .35}s" r="2.6" fill="#FFD87A" cx="${path(t)[0].toFixed(1)}" cy="${path(t)[1].toFixed(1)}"/>`;
    }).join("");
    const sagL = (t) => [t * 148, 58 - 26 * t + Math.sin(t * Math.PI) * 14];
    const sagR = (t) => [212 + t * 148, 32 + 26 * t + Math.sin(t * Math.PI) * 14];

    const moon = has("moon") ? `<g class="moon-g"><circle cx="180" cy="62" r="26" fill="#FFF3C4" opacity=".22"/><circle cx="180" cy="62" r="15" fill="#FFF3C4"/><circle cx="187" cy="57" r="12.5" fill="#2a3170"/><circle cx="176" cy="68" r="2" fill="#E8D8A0" opacity=".6"/></g>` : ghost(180, 66, "#c9c2ea");
    const telescope = has("telescope") ? `
      <g>
        <ellipse cx="334" cy="208" rx="26" ry="5" fill="rgba(0,0,0,.28)"/>
        <path d="M334 138L314 208M334 138L338 210M334 138L356 206" stroke="#7a5a3d" stroke-width="3" stroke-linecap="round"/>
        <g transform="translate(334 138) rotate(-148)">
          <rect x="-8" y="-9" width="62" height="18" rx="5" fill="#C9CED8"/><rect x="-8" y="-9" width="62" height="6" rx="3" fill="#E6E9EF"/>
          <rect x="44" y="-11" width="12" height="22" rx="3" fill="#4E5A78"/><rect x="14" y="-3" width="3" height="12" fill="#8D96A8"/><rect x="30" y="-3" width="3" height="12" fill="#8D96A8"/>
          <rect x="6" y="-16" width="26" height="6" rx="3" fill="#4E5A78"/>
        </g>
        <circle cx="334" cy="138" r="5" fill="#4E5A78"/>
      </g>` : ghost(330, 160, "#c9c2ea");
    const guitar = has("guitar") ? `
      <g transform="translate(50 162) rotate(13)">
        <ellipse cx="0" cy="3" rx="16" ry="3" fill="rgba(0,0,0,.3)" transform="rotate(-13)"/>
        <rect x="-3.4" y="-112" width="6.8" height="60" rx="1.5" fill="#6B452B"/>
        <path d="M-5 -122h10l1.5 12h-13z" fill="#4B3023"/>
        ${[-4, -1.3, 1.4, 4].map((x) => `<circle cx="${x}" cy="-118" r=".8" fill="#E8C8A0"/>`).join("")}
        <circle cx="0" cy="-48" r="13.5" fill="#D9893B"/><circle cx="0" cy="-22" r="18" fill="#D9893B"/>
        <circle cx="0" cy="-32" r="6" fill="#2d1c10"/><circle cx="0" cy="-32" r="7.6" fill="none" stroke="#8A5A2B" stroke-width="1.4"/>
        <rect x="-8" y="-14" width="16" height="3.4" rx="1.5" fill="#4B3023"/>
        <path d="M-1.8 -112V-14M0 -112V-14M1.8 -112V-14" stroke="#E8E0D0" stroke-width=".5"/>
        <path d="M-12 -38q-4 8 -2 22" stroke="#fff" stroke-opacity=".3" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      </g>` : ghost(50, 112, "#c9c2ea");
    const trophy = has("trophy") ? `
      <g>
        <path d="M252 96h12v-10h-12z" fill="#8A5A3C" opacity="0"/>
        <path d="M248 96h34l-3 -8h-28z" fill="#9B6848"/>
        <path d="M257 88v-6h16v6z" fill="#E0A92A"/><path d="M262 82v-8M268 82v-8" stroke="#E0A92A" stroke-width="2"/>
        <path d="M254 52h22v14q0 11 -11 11t-11 -11z" fill="#FFC94D"/><path d="M254 56q-9 0 -8 7t10 6M276 56q9 0 8 7t-10 6" stroke="#F0AE3A" stroke-width="2.2" fill="none"/>
        <path d="M258 56v12" stroke="#fff" stroke-opacity=".5" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M265 60l1.6 3.4 3.6 .5 -2.6 2.5 .6 3.6 -3.2 -1.7 -3.2 1.7 .6 -3.6 -2.6 -2.5 3.6 -.5z" fill="#fff" opacity=".85"/>
      </g>` : ghost(265, 70, "#c9c2ea");
    const chest = has("gift") ? `
      <g>
        <ellipse cx="276" cy="216" rx="34" ry="5" fill="rgba(0,0,0,.28)"/>
        <rect x="248" y="190" width="56" height="26" rx="3" fill="#9B6848"/><path d="M248 200h56M248 208h56" stroke="#7a4f33" stroke-width="1"/>
        <path d="M246 192q0 -20 30 -20t30 20z" fill="#B97B52"/><path d="M248 190q0 -14 28 -14t28 14" fill="none" stroke="#D49A6A" stroke-width="1.4"/>
        <rect x="270" y="172" width="12" height="44" fill="#E24A5E"/><rect x="246" y="190" width="60" height="5" fill="#C93A4E" opacity=".0"/>
        <path d="M276 172 q-12 -12 -16 -4 q4 8 16 4 q12 4 16 -4 q-4 -8 -16 4z" fill="#E24A5E"/><circle cx="276" cy="172" r="3.4" fill="#C93A4E"/>
        <rect x="272" y="196" width="8" height="9" rx="1.5" fill="#FFC94D" stroke="#E0A92A"/><circle cx="276" cy="200" r="1.3" fill="#7a5a10"/>
        <circle class="spark" cx="252" cy="176" r="1.8" fill="#FFF3C4"/><circle class="spark s2" cx="304" cy="182" r="1.6" fill="#FFF3C4"/>
      </g>` : ghost(276, 198, "#c9c2ea");

    return `
      <defs>
        <linearGradient id="at-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2D2A5E"/><stop offset="1" stop-color="#46417F"/></linearGradient>
        <linearGradient id="at-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7C5638"/><stop offset="1" stop-color="#553826"/></linearGradient>
        <linearGradient id="at-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#121A4E"/><stop offset="1" stop-color="#3F4A9A"/></linearGradient>
        <clipPath id="at-win"><path d="M140 118V70a40 40 0 0 1 80 0V118Z"/></clipPath>
        <radialGradient id="at-rug"><stop offset="0" stop-color="#8E6BD6"/><stop offset="1" stop-color="#6B4BB5"/></radialGradient>
      </defs>
      <rect width="360" height="152" fill="url(#at-wall)"/>
      <path d="M0 62 L180 0 L360 62" fill="none" stroke="#6B4A33" stroke-width="10" stroke-linejoin="round"/>
      <path d="M0 62 L180 0 L360 62" fill="none" stroke="#8A5F40" stroke-width="3" stroke-linejoin="round" opacity=".7"/>
      <path d="M0 150 L0 62M360 150 L360 62M180 0 L180 28" stroke="#6B4A33" stroke-width="8"/>
      <path d="M0 98 L58 62 M360 98 L302 62" stroke="#6B4A33" stroke-width="5"/>
      <!-- вертикальные доски стены -->
      ${Array.from({ length: 24 }, (_, i) => `<path d="M${i * 15} 150V${62 - Math.min(i * 15, 360 - i * 15) * .0}" stroke="#000" stroke-opacity=".08"/>`).join("")}
      <!-- звёздное окно -->
      <path d="M134 122V70a46 46 0 0 1 92 0V122Z" fill="#6B4A33"/>
      <g clip-path="url(#at-win)">
        <rect x="136" y="20" width="88" height="100" fill="url(#at-sky)"/>
        ${Array.from({ length: 16 }, (_, i) => `<circle class="tw" style="animation-delay:${(i % 6) * .5}s" cx="${(142 + rand() * 76).toFixed(0)}" cy="${(28 + rand() * 80).toFixed(0)}" r="${i % 4 ? 1 : 1.7}" fill="#fff"/>`).join("")}
        <path class="shoot" d="M200 40l-14 8" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>
        <path d="M136 122 Q160 100 180 108 T224 100 V122Z" fill="#171d52"/>
      </g>
      <path d="M180 24V122M140 78H220" stroke="#6B4A33" stroke-width="3"/>
      <rect x="130" y="120" width="100" height="6" rx="2" fill="#8A5F40"/>
      ${moon}
      <!-- гирлянда -->
      <path d="M0 58 Q74 84 148 58" fill="none" stroke="#3a2a22" stroke-width="1.2"/>
      <path d="M212 32 Q286 62 360 32" fill="none" stroke="#3a2a22" stroke-width="1.2"/>
      ${bulbs(sagL, 6, 0)}${bulbs(sagR, 6, 2)}
      <!-- полка -->
      <rect x="240" y="96" width="50" height="5" rx="2" fill="#8A5F40"/><path d="M246 101v8M284 101v8" stroke="#6B4A33" stroke-width="3"/>
      <rect x="82" y="96" width="38" height="5" rx="2" fill="#8A5F40"/>
      <rect x="86" y="82" width="9" height="14" rx="1" fill="#E0576F"/><rect x="96" y="78" width="8" height="18" rx="1" fill="#4EA6E0"/><rect x="105" y="84" width="9" height="12" rx="1" fill="#F2B84B"/>
      <!-- пол -->
      <rect y="150" width="360" height="80" fill="url(#at-floor)"/>
      ${[162, 176, 192, 210].map((y) => `<path d="M0 ${y}H360" stroke="rgba(0,0,0,.28)"/>`).join("")}
      <rect y="150" width="360" height="12" fill="url(#sc-fshade)"/>
      <rect y="146" width="360" height="6" fill="#4a3322"/>
      <path d="M142 126 L214 126 L300 224 L58 224Z" fill="#fff" opacity=".05"/>
      <ellipse cx="180" cy="204" rx="92" ry="19" fill="url(#at-rug)"/>
      <ellipse cx="180" cy="204" rx="92" ry="19" fill="none" stroke="#C9B6FF" stroke-width="2.2"/>
      <ellipse cx="180" cy="204" rx="68" ry="13" fill="none" stroke="#C9B6FF" stroke-opacity=".7" stroke-width="1.2" stroke-dasharray="3 4"/>
      <ellipse cx="180" cy="204" rx="40" ry="7" fill="none" stroke="#fff" stroke-opacity=".25"/>
      <!-- коробки -->
      <rect x="84" y="176" width="34" height="26" fill="#C99A63"/><path d="M84 176h34v6h-34zM98 176v26" stroke="#A67A47"/><rect x="92" y="164" width="24" height="14" fill="#D3A872"/><path d="M92 170h24" stroke="#A67A47"/>
      ${guitar}${trophy}${telescope}${chest}
      ${tail(true, "#0a0a30")}`;
  }

  const ROOMS = { living, kitchen, garden, attic };

  function render(roomId, ctx) {
    const night = roomId === "attic" ? true : ctx.night;
    const fn = ROOMS[roomId] || living;
    return `<svg class="scene-svg ${night ? "is-night" : ""}" viewBox="0 0 360 230" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" role="img">${common}${fn({ ...ctx, night })}</svg>`;
  }

  return { render };
})();
