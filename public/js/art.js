/* art.js — procedural SVG "food photography". Zero external assets, zero network.
   Every dish image in the app is generated here at runtime as an inline data-URI. */
const Art = (function () {
  const enc = (s) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);

  function rng(seed) {
    let s = ((seed | 0) * 16807 + 11) % 2147483647;
    if (s <= 0) s = 42;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  }
  const R = (r, a, b) => a + r() * (b - a);

  function shell(o) {
    const w = o.w || 440, h = o.h || 330;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${o.bg1}"/><stop offset="1" stop-color="${o.bg2}"/></linearGradient>
<radialGradient id="vg" cx="50%" cy="42%" r="72%"><stop offset="52%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".48"/></radialGradient>
<radialGradient id="zap" cx="30%" cy="18%" r="62%"><stop offset="0" stop-color="#fff" stop-opacity=".30"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${w}" height="${h}" fill="url(#bg)"/>
${o.inner}
<rect width="${w}" height="${h}" fill="url(#zap)"/>
<rect width="${w}" height="${h}" fill="url(#vg)"/>
</svg>`;
  }

  const K = {
    /* ---------------- biryani / rice ---------------- */
    biryani(seed) {
      const r = rng(seed), W = 440, H = 330;
      let s = '';
      s += `<ellipse cx="220" cy="254" rx="172" ry="46" fill="#000" opacity=".30"/>`;
      s += `<ellipse cx="220" cy="238" rx="164" ry="54" fill="#efe8db"/>`;
      s += `<ellipse cx="220" cy="233" rx="146" ry="45" fill="#f8f3e7"/>`;
      s += `<ellipse cx="220" cy="212" rx="122" ry="50" fill="#f0d9a3"/>`;
      s += `<ellipse cx="212" cy="200" rx="86" ry="36" fill="#f7e6bd"/>`;
      const cols = ['#c9471b', '#8a4b1e', '#2f6b34', '#d9a441', '#fbf6ea', '#7a3b12', '#e0662a'];
      for (let i = 0; i < 78; i++) {
        const a = R(r, 0, Math.PI * 2), rad = Math.sqrt(r()) * 108;
        const cx = 220 + Math.cos(a) * rad, cy = 204 + Math.sin(a) * rad * 0.36;
        s += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${R(r, 1.6, 3.8).toFixed(1)}" fill="${cols[(r() * cols.length) | 0]}" opacity=".9"/>`;
      }
      for (let i = 0; i < 5; i++) {
        const cx = 220 + R(r, -86, 86), cy = 202 + R(r, -24, 24);
        s += `<ellipse cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" rx="${R(r, 13, 22).toFixed(0)}" ry="${R(r, 9, 15).toFixed(0)}" fill="#6b3418" opacity=".95" transform="rotate(${R(r, -40, 40).toFixed(0)} ${cx.toFixed(0)} ${cy.toFixed(0)})"/>`;
      }
      s += `<g transform="translate(336 190) rotate(-20)"><circle r="21" fill="#9fc23c"/><circle r="16" fill="#d6e385"/><path d="M0-15V15M-15 0H15M-10.5-10.5L10.5 10.5M-10.5 10.5L10.5-10.5" stroke="#f2f7d4" stroke-width="1.5"/></g>`;
      s += `<g transform="translate(84 176)"><ellipse rx="36" ry="27" fill="#dedbd3"/><ellipse rx="28" ry="20" fill="#f8f6f1"/><circle cx="-7" cy="-2" r="5" fill="#cbe0b4"/><circle cx="6" cy="4" r="3.6" fill="#cbe0b4"/></g>`;
      return { bg1: '#5b2a10', bg2: '#2a1207', inner: s, w: W, h: H };
    },

    /* ---------------- kebabs on grill ---------------- */
    kebab(seed) {
      const r = rng(seed);
      let s = '';
      s += `<rect x="40" y="86" width="360" height="176" rx="26" fill="#241612"/>`;
      for (let i = 0; i < 9; i++) s += `<rect x="${52 + i * 40}" y="90" width="6" height="168" rx="3" fill="#140c0a" opacity=".8"/>`;
      for (let i = 0; i < 4; i++) {
        const y = 118 + i * 38;
        s += `<rect x="66" y="${y}" width="308" height="7" rx="3" fill="#4b3a33" opacity=".55"/>`;
      }
      for (let i = 0; i < 6; i++) {
        const cx = 96 + i * 50, cy = 150 + Math.sin(i * 1.3) * 16;
        s += `<g transform="translate(${cx} ${cy}) rotate(${R(r, -12, 12).toFixed(0)})">
        <ellipse rx="27" ry="19" fill="#000" opacity=".35" cy="4"/>
        <ellipse rx="26" ry="18" fill="#7a4523"/>
        <ellipse rx="20" ry="13" fill="#96582f"/>
        <path d="M-14-6 L10-9 M-16 2 L12-1 M-12 8 L14 5" stroke="#43210f" stroke-width="2.6" opacity=".75" stroke-linecap="round"/>
        <ellipse cx="-6" cy="-6" rx="6" ry="3" fill="#b97a49" opacity=".6"/></g>`;
      }
      s += `<g transform="translate(352 250)"><ellipse rx="40" ry="16" fill="#e8dccb" opacity=".9"/><ellipse rx="30" ry="11" fill="#f7f1e6"/><ellipse rx="18" ry="6" fill="#c9503f" opacity=".5"/></g>`;
      s += `<g transform="translate(78 254)"><circle r="17" fill="#a9c645"/><circle r="11" fill="#e2ecab"/><path d="M0-11V11M-11 0H11" stroke="#f4f8dd" stroke-width="1.4"/></g>`;
      for (let i = 0; i < 12; i++) s += `<circle cx="${R(r, 60, 380).toFixed(0)}" cy="${R(r, 260, 300).toFixed(0)}" r="${R(r, 2, 4).toFixed(0)}" fill="#3f6b2c" opacity=".8"/>`;
      return { bg1: '#3b2418', bg2: '#160d09', inner: s };
    },

    /* ---------------- dosa ---------------- */
    dosa(seed) {
      const r = rng(seed);
      let s = '';
      s += `<ellipse cx="220" cy="240" rx="180" ry="58" fill="#2f5c2c"/>`;
      s += `<ellipse cx="220" cy="234" rx="164" ry="48" fill="#3d7338"/>`;
      for (let i = 0; i < 10; i++) {
        const a = R(r, 0, Math.PI * 2), rad = R(r, 40, 150);
        s += `<path d="M${220 + Math.cos(a) * rad} ${232 + Math.sin(a) * rad * 0.3} q14 -8 28 0" stroke="#4f8b46" stroke-width="2" fill="none" opacity=".7"/>`;
      }
      s += `<g transform="translate(196 196) rotate(-8)">
        <path d="M-96 44 Q-30 -70 96 10 Q40 62 -96 44Z" fill="#c98a30"/>
        <path d="M-84 40 Q-26 -56 82 10 Q36 50 -84 40Z" fill="#e0a94a"/>
        <path d="M-64 34 Q-18 -40 62 12 Q26 40 -64 34Z" fill="#eec070" opacity=".85"/>
        <path d="M-40 26 Q-6 -22 40 14" stroke="#c98a30" stroke-width="2" fill="none" opacity=".6"/>
      </g>`;
      s += `<g transform="translate(330 196)"><ellipse rx="30" ry="23" fill="#eceae2"/><ellipse rx="23" ry="17" fill="#f6f4ec"/><ellipse rx="13" ry="9" fill="#f2d9a0"/></g>`;
      s += `<g transform="translate(296 250)"><ellipse rx="28" ry="21" fill="#e6e4dc"/><ellipse rx="21" ry="15" fill="#3f7a3a"/><circle cx="-4" cy="-3" r="4" fill="#6fa85c"/></g>`;
      s += `<g transform="translate(346 254)"><ellipse rx="26" ry="19" fill="#e6e4dc"/><ellipse rx="19" ry="13" fill="#b6402f"/></g>`;
      return { bg1: '#6b4a22', bg2: '#2a1a0a', inner: s };
    },

    /* ---------------- pizza ---------------- */
    pizza(seed) {
      const r = rng(seed);
      let s = '';
      s += `<rect x="30" y="60" width="380" height="220" rx="22" fill="#8a5a2f"/>`;
      for (let i = 0; i < 7; i++) s += `<rect x="${38 + i * 54}" y="64" width="2" height="212" fill="#6d4523" opacity=".8"/>`;
      s += `<circle cx="220" cy="172" r="112" fill="#c98a3c"/>`;
      s += `<circle cx="220" cy="172" r="100" fill="#e8b45c"/>`;
      s += `<circle cx="220" cy="172" r="88" fill="#f2e3ae"/>`;
      for (let i = 0; i < 26; i++) {
        const a = R(r, 0, Math.PI * 2), rad = Math.sqrt(r()) * 80;
        s += `<circle cx="${(220 + Math.cos(a) * rad).toFixed(0)}" cy="${(172 + Math.sin(a) * rad).toFixed(0)}" r="${R(r, 6, 13).toFixed(0)}" fill="${['#c9452e', '#f6f1de', '#8fae3f', '#6c1330'][(r() * 4) | 0]}" opacity=".92"/>`;
      }
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        s += `<circle cx="${(220 + Math.cos(a) * 62).toFixed(0)}" cy="${(172 + Math.sin(a) * 62).toFixed(0)}" r="11" fill="#b53727"/><circle cx="${(220 + Math.cos(a) * 62).toFixed(0)}" cy="${(172 + Math.sin(a) * 62).toFixed(0) - 3}" r="4" fill="#d95f4a" opacity=".8"/>`;
      }
      s += `<path d="M220 172 L132 96 M220 172 L308 96 M220 172 L220 60" stroke="#d8a552" stroke-width="3" opacity=".55"/>`;
      return { bg1: '#332420', bg2: '#120b09', inner: s };
    },

    /* ---------------- burger ---------------- */
    burger(seed) {
      const r = rng(seed);
      let s = '';
      s += `<ellipse cx="220" cy="266" rx="120" ry="22" fill="#000" opacity=".35"/>`;
      s += `<path d="M112 176 Q220 66 328 176 Z" fill="#d19245"/>`;
      s += `<path d="M124 172 Q220 82 316 172 Z" fill="#e8ab5c"/>`;
      for (let i = 0; i < 16; i++) {
        const a = R(r, 0.12, 0.88) * Math.PI, rad = R(r, 20, 78);
        s += `<ellipse cx="${(220 + Math.cos(a) * rad * 1.05).toFixed(0)}" cy="${(172 - Math.sin(a) * rad * 0.86).toFixed(0)}" rx="4" ry="2.3" fill="#f6e6c2" transform="rotate(${R(r, 0, 60).toFixed(0)} 220 172)"/>`;
      }
      s += `<path d="M116 176 q22 22 44 4 q22 20 46 2 q24 20 46 0 q22 20 44 -6 Z" fill="#5c9c3c"/>`;
      s += `<rect x="116" y="196" width="208" height="26" rx="12" fill="#4a2a16"/>`;
      s += `<path d="M120 190 h200 v10 q-24 16 -50 2 q-24 16 -50 2 q-24 16 -50 2 q-24 16 -50 -6Z" fill="#f0b429"/>`;
      s += `<rect x="120" y="222" width="200" height="18" rx="9" fill="#e0e2c8"/>`;
      s += `<path d="M118 240 q102 26 204 0 v14 q-102 26 -204 0Z" fill="#c98a3c"/>`;
      s += `<path d="M118 252 q102 26 204 0 v10 q-102 24 -204 0Z" fill="#d99a4e"/>`;
      return { bg1: '#4a3323', bg2: '#1a110a', inner: s };
    },

    /* ---------------- thali / north indian ---------------- */
    thali(seed) {
      const r = rng(seed);
      let s = '';
      s += `<ellipse cx="220" cy="248" rx="176" ry="52" fill="#000" opacity=".30"/>`;
      s += `<circle cx="220" cy="188" r="138" fill="#b9bec2"/>`;
      s += `<circle cx="220" cy="184" r="132" fill="#d9dcdf"/>`;
      s += `<circle cx="220" cy="184" r="120" fill="#eceef0"/>`;
      s += `<g transform="translate(158 156)"><circle r="44" fill="#cdd2d6"/><circle r="37" fill="#e8a63c"/><circle cx="-8" cy="-6" r="12" fill="#f2c46b" opacity=".8"/></g>`;
      s += `<g transform="translate(282 150)"><circle r="42" fill="#cdd2d6"/><circle r="35" fill="#bf4a2c"/><circle cx="6" cy="-4" r="10" fill="#e0704d" opacity=".85"/><circle cx="-9" cy="7" r="6" fill="#8fae3f"/></g>`;
      s += `<g transform="translate(300 232)"><circle r="40" fill="#cdd2d6"/><circle r="33" fill="#f6f1e4"/><path d="M-22-6 q22 -10 44 0" stroke="#e2d9c2" stroke-width="3" fill="none"/><path d="M-22 4 q22 -10 44 0" stroke="#e2d9c2" stroke-width="3" fill="none"/></g>`;
      s += `<g transform="translate(150 238)"><circle r="42" fill="#cdd2d6"/><circle r="34" fill="#e8c98a"/><circle r="24" fill="#f2dcae"/><circle cx="-6" cy="-4" r="4" fill="#c9a25a"/></g>`;
      s += `<g transform="translate(214 214)"><circle r="34" fill="#cdd2d6"/><circle r="27" fill="#f0d9a8"/><circle r="18" fill="#f7e8c0"/><circle cx="0" cy="0" r="7" fill="#b5643a" opacity=".8"/></g>`;
      for (let i = 0; i < 10; i++) s += `<circle cx="${R(r, 120, 320).toFixed(0)}" cy="${R(r, 250, 268).toFixed(0)}" r="${R(r, 2, 4).toFixed(0)}" fill="#8fae3f" opacity=".65"/>`;
      return { bg1: '#5b3c22', bg2: '#241407', inner: s };
    },

    /* ---------------- noodles / chinese ---------------- */
    noodles(seed) {
      const r = rng(seed);
      let s = '';
      s += `<ellipse cx="220" cy="250" rx="150" ry="42" fill="#000" opacity=".32"/>`;
      s += `<circle cx="220" cy="186" r="126" fill="#efe9dd"/>`;
      s += `<circle cx="220" cy="186" r="114" fill="#f8f4ea"/>`;
      s += `<circle cx="220" cy="186" r="98" fill="#e8dfc9"/>`;
      for (let i = 0; i < 26; i++) {
        const a = R(r, 0, Math.PI * 2), rad = Math.sqrt(r()) * 84;
        const x = 220 + Math.cos(a) * rad, y = 182 + Math.sin(a) * rad * 0.8;
        s += `<path d="M${(x - 26).toFixed(0)} ${y.toFixed(0)} q26 ${R(r, -18, 18).toFixed(0)} 52 ${R(r, -6, 6).toFixed(0)}" stroke="${['#e8c86a', '#dcb54f', '#f0d78e'][(r() * 3) | 0]}" stroke-width="${R(r, 4, 6).toFixed(1)}" fill="none" stroke-linecap="round"/>`;
      }
      for (let i = 0; i < 16; i++) {
        const a = R(r, 0, Math.PI * 2), rad = Math.sqrt(r()) * 74;
        s += `<rect x="${(220 + Math.cos(a) * rad).toFixed(0)}" y="${(182 + Math.sin(a) * rad * 0.8).toFixed(0)}" width="${R(r, 12, 22).toFixed(0)}" height="5" rx="2.5" fill="${['#4a8b3a', '#c9503f', '#e08a2f', '#f2e9d2'][(r() * 4) | 0]}" transform="rotate(${R(r, 0, 180).toFixed(0)} 220 182)"/>`;
      }
      s += `<g transform="rotate(28 220 186)"><rect x="150" y="60" width="7" height="230" rx="3.5" fill="#a9764a"/><rect x="166" y="60" width="7" height="230" rx="3.5" fill="#c08a56"/></g>`;
      return { bg1: '#3a2a24', bg2: '#140d0a', inner: s };
    },

    /* ---------------- dessert / sweets ---------------- */
    dessert(seed) {
      const r = rng(seed);
      let s = '';
      s += `<ellipse cx="220" cy="252" rx="140" ry="40" fill="#000" opacity=".3"/>`;
      s += `<ellipse cx="220" cy="236" rx="150" ry="48" fill="#efe9df"/>`;
      s += `<ellipse cx="220" cy="230" rx="132" ry="40" fill="#f8f4ec"/>`;
      s += `<ellipse cx="220" cy="214" rx="96" ry="34" fill="#c98a4a" opacity=".55"/>`;
      for (let i = 0; i < 5; i++) {
        const cx = 172 + i * 24 + R(r, -6, 6), cy = 206 + R(r, -10, 8), rr = R(r, 20, 27);
        s += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${rr.toFixed(0)}" fill="#8a4520"/><circle cx="${(cx - rr * 0.3).toFixed(0)}" cy="${(cy - rr * 0.35).toFixed(0)}" r="${(rr * 0.42).toFixed(0)}" fill="#b9713a" opacity=".7"/><circle cx="${(cx - rr * 0.4).toFixed(0)}" cy="${(cy - rr * 0.5).toFixed(0)}" r="${(rr * 0.16).toFixed(0)}" fill="#f2d9a8" opacity=".8"/>`;
      }
      for (let i = 0; i < 14; i++) s += `<circle cx="${R(r, 150, 292).toFixed(0)}" cy="${R(r, 190, 236).toFixed(0)}" r="${R(r, 1.4, 3).toFixed(1)}" fill="#e8cf9a" opacity=".8"/>`;
      s += `<g transform="translate(310 176) rotate(14)"><ellipse rx="26" ry="16" fill="#7b4522"/><ellipse rx="18" ry="10" fill="#9c6134"/><circle cx="0" cy="-4" r="5" fill="#e8cf9a"/></g>`;
      return { bg1: '#4a2a1e', bg2: '#1d0f0a', inner: s };
    },

    /* ---------------- roll / wrap ---------------- */
    roll(seed) {
      const r = rng(seed);
      let s = '';
      s += `<g transform="translate(220 186) rotate(-16)">
        <rect x="-118" y="-50" width="236" height="100" rx="50" fill="#e9d9b8"/>
        <rect x="-108" y="-42" width="216" height="84" rx="42" fill="#f4e8cc"/>
        <ellipse cx="-112" cy="0" rx="18" ry="46" fill="#d9c39a"/>
        <ellipse cx="-112" cy="0" rx="12" ry="36" fill="#a8492f"/>
        <circle cx="-114" cy="-14" r="6" fill="#5c9c3c"/><circle cx="-108" cy="10" r="5" fill="#e8b45c"/>
      </g>`;
      s += `<rect x="86" y="196" width="86" height="82" rx="16" fill="#c8ccd2" transform="rotate(-16 129 237)"/>`;
      for (let i = 0; i < 12; i++) s += `<circle cx="${R(r, 100, 380).toFixed(0)}" cy="${R(r, 250, 300).toFixed(0)}" r="${R(r, 1.6, 3.4).toFixed(1)}" fill="${['#5c9c3c', '#c9503f', '#e8c86a'][(r() * 3) | 0]}" opacity=".8"/>`;
      s += `<g transform="translate(348 254)"><ellipse rx="30" ry="20" fill="#e6e2d8"/><ellipse rx="22" ry="14" fill="#3f7a3a"/></g>`;
      return { bg1: '#4a3320', bg2: '#1c1109', inner: s };
    },

    /* ---------------- chai / coffee ---------------- */
    chai(seed) {
      const r = rng(seed);
      let s = '';
      s += `<ellipse cx="220" cy="278" rx="120" ry="24" fill="#000" opacity=".35"/>`;
      s += `<path d="M152 148 L288 148 L268 274 L172 274 Z" fill="#a35a33"/>`;
      s += `<path d="M158 152 L282 152 L264 268 L176 268 Z" fill="#c07347"/>`;
      s += `<path d="M158 152 L282 152 L277 190 L163 190 Z" fill="#d1895a" opacity=".7"/>`;
      s += `<ellipse cx="220" cy="156" rx="62" ry="16" fill="#8a4a26"/>`;
      s += `<ellipse cx="220" cy="155" rx="53" ry="12" fill="#b06a3c"/>`;
      s += `<ellipse cx="220" cy="154" rx="42" ry="9" fill="#e0bfa0" opacity=".8"/>`;
      for (let i = 0; i < 3; i++) {
        const x = 196 + i * 24;
        s += `<path d="M${x} 132 q-16 -20 0 -36 q16 -16 0 -32" stroke="#fff" stroke-width="3" opacity=".22" fill="none" stroke-linecap="round"/>`;
      }
      for (let i = 0; i < 12; i++) s += `<circle cx="${R(r, 70, 380).toFixed(0)}" cy="${R(r, 296, 316).toFixed(0)}" r="${R(r, 1.5, 3).toFixed(1)}" fill="#c98a52" opacity=".55"/>`;
      return { bg1: '#4a2f1c', bg2: '#1a0f07', inner: s };
    },

    /* ---------------- fresh produce (instamart) ---------------- */
    veg(seed) {
      const r = rng(seed);
      let s = '';
      s += `<g transform="translate(220 190)">`;
      const items = [
        ['#c9452e', 64, -70, 10, '#e07a63'],
        ['#6b3fa0', 54, 0, -30, '#9a6fd0'],
        ['#8fae3f', 58, 74, 14, '#b9d16a'],
        ['#e0a63c', 44, 40, 44, '#f2c877'],
        ['#c9452e', 40, -54, 52, '#e07a63'],
      ];
      items.forEach(([c, rad, dx, dy, hi]) => {
        s += `<circle cx="${dx}" cy="${dy}" r="${rad}" fill="${c}"/><circle cx="${dx - rad * 0.3}" cy="${dy - rad * 0.35}" r="${rad * 0.38}" fill="${hi}" opacity=".55"/>`;
      });
      s += `<path d="M0-96 q22 -26 46 -14 q-14 30 -46 14Z" fill="#4f8b46"/>`;
      s += `</g>`;
      for (let i = 0; i < 14; i++) s += `<circle cx="${R(r, 60, 380).toFixed(0)}" cy="${R(r, 60, 130).toFixed(0)}" r="${R(r, 2, 5).toFixed(1)}" fill="#5c9c3c" opacity=".35"/>`;
      return { bg1: '#eaf0e2', bg2: '#c7d6bd', inner: s };
    },

    grocery(seed) {
      const r = rng(seed);
      let s = '';
      s += `<g transform="translate(220 200)"><path d="M-90 -60 L90 -60 L70 74 L-70 74 Z" fill="#c79a5b"/><path d="M-80 -52 L80 -52 L62 64 L-62 64 Z" fill="#e0b578"/></g>`;
      s += `<g transform="translate(220 172)"><rect x="-62" y="-70" width="52" height="66" rx="8" fill="#f2f2ee"/><rect x="-62" y="-70" width="52" height="20" rx="8" fill="#c9503f"/></g>`;
      s += `<g transform="translate(220 176)"><rect x="4" y="-64" width="58" height="60" rx="8" fill="#f2f2ee"/><rect x="4" y="-64" width="58" height="18" rx="8" fill="#2f6b8a"/></g>`;
      s += `<circle cx="182" cy="112" r="26" fill="#8fae3f"/><circle cx="232" cy="106" r="20" fill="#c9452e"/>`;
      return { bg1: '#f0ece2', bg2: '#d8cdb8', inner: s };
    },

    /* ---------------- sweets box / cake ---------------- */
    cake(seed) {
      const r = rng(seed);
      let s = '';
      s += `<g transform="translate(220 200)"><path d="M-90 30 L-90 -40 Q0 -66 90 -40 L90 30 Z" fill="#5b2f22"/><path d="M-90 -40 Q0 -66 90 -40 L90 -30 Q0 -56 -90 -30 Z" fill="#7b402e"/></g>`;
      s += `<path d="M-90 -30 q22 16 45 0 q22 16 45 0 q22 16 45 0 q22 16 45 0 L90 10 q-22 16 -45 0 q-22 16 -45 0 q-22 16 -45 0 q-22 16 -45 0 Z" fill="#f4e2c6"/>`;
      s += `<circle cx="196" cy="118" r="16" fill="#c9303f"/><circle cx="216" cy="112" r="10" fill="#e0555f" opacity=".8"/>`;
      s += `<g transform="translate(220 328) rotate(0)"><rect x="-110" y="-14" width="220" height="12" rx="6" fill="#e8e2d4"/></g>`;
      for (let i = 0; i < 14; i++) s += `<circle cx="${R(r, 150, 290).toFixed(0)}" cy="${R(r, 96, 140).toFixed(0)}" r="${R(r, 1.4, 2.8).toFixed(1)}" fill="#f2e2c6" opacity=".7"/>`;
      return { bg1: '#4a2230', bg2: '#1a0d12', inner: s };
    },
  };

  const cache = Object.create(null);
  function art(kind, seed) {
    const key = kind + ':' + (seed || 1);
    if (cache[key]) return cache[key];
    const fn = K[kind] || K.thali;
    return (cache[key] = enc(shell(fn(seed || 1))));
  }

  /* small flat icons used inside the UI (inline svg strings, currentColor) */
  const I = {
    star: '<path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.45 6.2 20.5l1.1-6.45-4.7-4.6 6.5-.95z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    caret: '<path d="M6 9l6 6 6-6"/>',
    heart: '<path d="M12 20s-7-4.35-7-9.5A4.5 4.5 0 0112 7a4.5 4.5 0 017 3.5C19 15.65 12 20 12 20z"/>',
    home: '<path d="M4 11l8-7 8 7"/><path d="M6.5 10v9h11v-9"/>',
    bag: '<path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8V6a3 3 0 016 0v2"/>',
    store: '<path d="M4 10h16v10H4z"/><path d="M3 10l1.5-5h15L21 10"/><path d="M9 20v-6h6v6"/>',
    order: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    tag: '<path d="M4 12.5L12.5 4H20v7.5L11.5 20z"/><circle cx="16.2" cy="7.8" r="1.4"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    pin: '<path d="M12 21s6-5.2 6-10a6 6 0 10-12 0c0 4.8 6 10 6 10z"/><circle cx="12" cy="11" r="2.4"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    share: '<path d="M12 15V4"/><path d="M8 8l4-4 4 4"/><path d="M5 14v5h14v-5"/>',
    sort: '<path d="M7 5v14M7 19l-3-3M7 19l3-3"/><path d="M14 6h6M14 11h4M14 16h2"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    check: '<path d="M5 13l4.5 4.5L19 7"/>',
    dots: '<circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/>',
    one: '<path d="M5 12a7 7 0 0114 0"/><path d="M8 12a4 4 0 018 0"/><circle cx="12" cy="12" r="1.4"/>',
    bike: '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17l3-7h5l3 7"/><path d="M9 10h4"/>',
    leaf: '<path d="M4 20c8 1 16-4 16-16C10 4 3 10 4 20z"/><path d="M4 20C7 15 11 12 16 10"/>',
    help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.5 2.5 0 114 2c-.9.7-1.6 1.2-1.6 2.4"/><circle cx="12" cy="17.4" r=".9" fill="currentColor" stroke="none"/>',
    user: '<circle cx="12" cy="8.5" r="3.6"/><path d="M5 20a7 7 0 0114 0"/>',
    cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M3 4h2.2l2.3 11.2A2 2 0 009.5 17h8.2a2 2 0 002-1.6L21 7H6"/>',
    bolt: '<path d="M13 2L5 13.5h5.5L10 22l8-11.5h-5.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
    moon: '<path d="M20 14.2A8.2 8.2 0 019.8 4 8.5 8.5 0 1020 14.2z"/>',
    wallet: '<path d="M3 7.5A2.5 2.5 0 015.5 5H18a3 3 0 013 3v9a3 3 0 01-3 3H6a3 3 0 01-3-3z"/><path d="M3 9h15"/><circle cx="17" cy="13.5" r="1.2"/>',
  };
  function icon(name, size) {
    const p = I[name] || '';
    return `<svg class="ic" viewBox="0 0 24 24" width="${size || 20}" height="${size || 20}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  }
  function starSolid(size) {
    return `<svg viewBox="0 0 24 24" width="${size || 12}" height="${size || 12}" fill="currentColor" aria-hidden="true"><path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.45 6.2 20.5l1.1-6.45-4.7-4.6 6.5-.95z"/></svg>`;
  }

  return { art, icon, starSolid };
})();
