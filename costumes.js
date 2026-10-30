// =====================================================
// costumes.js — ギルチキの着せ替え（からだの服・あたまのアクセサリー）
//
// 座標はすべて giruchiki.png と同じ 414×440。どの衣装も viewBox="0 0 414 440" の
// SVG に入れて、絵にぴったり重ねる前提で作ってある。
//
// 1つの衣装は2つの層を持つ：
//   wear … 絵の形で切り抜き、乗算で重ねる層（服の色・柄）。
//           元の線（羽やからだの輪郭）が服の上に透けて見える。
//   top  … そのまま上に乗せる層（帽子・メガネなど）。頭より上にはみ出してよい。
// からだの服は主に wear、あたまのアクセサリーは主に top を使う。
//
// slot は 'body'（からだ）か 'head'（あたま）。
// event が付いているものはイベントで配る限定品で、ガチャからは出ない。
// 重ねる順番は「絵 → からだの wear → あたまの wear → からだの top → あたまの top」。
// =====================================================

export const CHIKI_OUTFITS = [
  {
    id: 'body_samue',
    slot: 'body',
    name: '店主の作務衣',
    wear: `<path d="M50 197 Q104 186 160 192 Q218 198 272 191 L282 256 Q318 262 336 284 Q348 318 330 346 Q300 368 240 366 Q190 370 150 362 L50 362 Z" fill="#33405E"/> <path d="M112 190 L214 312 L198 322 L96 204 Z" fill="#E9E1CF"/> <path d="M236 190 L170 300 L156 290 L220 190 Z" fill="#E9E1CF"/> <path d="M150 318 L232 318" stroke="#E9E1CF" stroke-width="7" stroke-linecap="round"/>`,
    top: ``,
  },
  {
    id: 'body_tsumi',
    slot: 'body',
    name: '「罪」Tシャツ',
    wear: `<path d="M50 200 Q90 196 112 204 Q150 226 196 210 Q230 198 270 200 L282 256 Q318 262 336 284 Q348 318 330 346 Q300 368 240 366 Q190 370 150 362 L50 362 Z" fill="#B8432F"/> <text x="133" y="300" text-anchor="middle" font-family="'Hiragino Mincho ProN','Yu Mincho','Noto Serif CJK JP',serif" font-weight="900" font-size="58" fill="#FFF8EC">罪</text>`,
    top: ``,
  },
  {
    id: 'body_happi',
    slot: 'body',
    name: '祭りの法被',
    wear: `<path d="M50 197 Q104 186 160 192 Q218 198 272 191 L282 256 Q318 262 336 284 Q348 318 330 346 Q300 368 240 366 Q190 370 150 362 L50 362 Z" fill="#2F4E86"/> <path d="M80 192 L132 192 Q128 280 140 364 L86 364 Q78 280 80 192 Z" fill="#F6F1E6"/> <text x="112" y="258" text-anchor="middle" font-family="'Hiragino Mincho ProN','Yu Mincho','Noto Serif CJK JP',serif" font-weight="900" font-size="30" fill="#2F4E86">麺</text> <text x="114" y="298" text-anchor="middle" font-family="'Hiragino Mincho ProN','Yu Mincho','Noto Serif CJK JP',serif" font-weight="900" font-size="30" fill="#2F4E86">祭</text> <path d="M140 342 q12 -10 24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0" stroke="#F6F1E6" stroke-width="5" fill="none"/> <path d="M140 326 q12 -10 24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0" stroke="#F6F1E6" stroke-width="3" fill="none"/>`,
    top: ``,
  },
  {
    id: 'body_gakuran',
    slot: 'body',
    name: '学ラン',
    wear: `<path d="M50 197 Q104 186 160 192 Q218 198 272 191 L282 256 Q318 262 336 284 Q348 318 330 346 Q300 368 240 366 Q190 370 150 362 L50 362 Z" fill="#23242B"/> <path d="M60 191 L262 191 L264 214 Q160 208 60 214 Z" fill="#33353F"/> <path d="M64 195 L262 195" stroke="#F4F1EA" stroke-width="5"/> <circle cx="118" cy="236" r="7" fill="#E3B341"/><circle cx="116" cy="234" r="2.5" fill="#FFF2C4"/><circle cx="121" cy="268" r="7" fill="#E3B341"/><circle cx="119" cy="266" r="2.5" fill="#FFF2C4"/><circle cx="124" cy="300" r="7" fill="#E3B341"/><circle cx="122" cy="298" r="2.5" fill="#FFF2C4"/><circle cx="127" cy="332" r="7" fill="#E3B341"/><circle cx="125" cy="330" r="2.5" fill="#FFF2C4"/> <path d="M300 300 L322 286" stroke="#E3B341" stroke-width="4" stroke-linecap="round"/>`,
    top: ``,
  },
  {
    id: 'body_sailor',
    slot: 'body',
    name: 'セーラー服',
    wear: `<path d="M56 192 L258 192 L250 236 Q206 244 160 270 Q130 248 104 236 L56 236 Z" fill="#26355C"/> <path d="M60 226 L100 226 Q132 240 160 258 Q204 234 246 226" stroke="#F6F3EC" stroke-width="4" fill="none"/> <path d="M140 252 L180 252 L170 300 L160 314 L150 300 Z" fill="#C8372D"/> <path d="M146 246 Q160 238 174 246 L172 258 L148 258 Z" fill="#A82C24"/>`,
    top: ``,
  },
  {
    id: 'body_suit',
    slot: 'body',
    name: 'スーツ',
    wear: `<path d="M50 197 Q104 186 160 192 Q218 198 272 191 L282 256 Q318 262 336 284 Q348 318 330 346 Q300 368 240 366 Q190 370 150 362 L50 362 Z" fill="#3B404C"/> <path d="M118 191 L206 191 L162 276 Z" fill="#F7F7F4"/> <path d="M118 191 L148 191 L162 276 L132 236 Z" fill="#4A505E"/> <path d="M206 191 L178 191 L162 276 L192 236 Z" fill="#4A505E"/> <path d="M155 200 L169 200 L172 214 L167 262 L162 272 L157 262 L152 214 Z" fill="#C0392B"/> <path d="M154 214 L170 214" stroke="#8E2A20" stroke-width="2"/> <circle cx="162" cy="300" r="5" fill="#2A2E38"/><circle cx="162" cy="330" r="5" fill="#2A2E38"/>`,
    top: ``,
  },
  {
    id: 'body_border',
    slot: 'body',
    name: 'ボーダー',
    wear: `<path d="M50 197 Q104 186 160 192 Q218 198 272 191 L282 256 Q318 262 336 284 Q348 318 330 346 Q300 368 240 366 Q190 370 150 362 L50 362 Z" fill="#FBFAF6"/><rect x="40" y="204" width="320" height="12" fill="#2C3E66"/><rect x="40" y="230" width="320" height="12" fill="#2C3E66"/><rect x="40" y="256" width="320" height="12" fill="#2C3E66"/><rect x="40" y="282" width="320" height="12" fill="#2C3E66"/><rect x="40" y="308" width="320" height="12" fill="#2C3E66"/><rect x="40" y="334" width="320" height="12" fill="#2C3E66"/><rect x="40" y="360" width="320" height="12" fill="#2C3E66"/>`,
    top: ``,
  },
  {
    id: 'body_apron',
    slot: 'body',
    name: 'ラーメン屋の前掛け',
    wear: `<path d="M60 282 Q190 276 300 282 L310 300 Q330 330 320 352 Q290 370 240 368 Q190 372 150 364 L60 364 Z" fill="#283A63"/> <path d="M60 276 Q190 270 300 276 L302 290 Q190 284 60 290 Z" fill="#F4EFE4"/> <text x="170" y="350" text-anchor="middle" font-family="'Hiragino Mincho ProN','Yu Mincho','Noto Serif CJK JP',serif" font-weight="900" font-size="54" fill="#F4EFE4">ま</text>`,
    top: ``,
  },
  {
    id: 'body_yukata',
    slot: 'body',
    name: '浴衣',
    wear: `<path d="M50 197 Q104 186 160 192 Q218 198 272 191 L282 256 Q318 262 336 284 Q348 318 330 346 Q300 368 240 366 Q190 370 150 362 L50 362 Z" fill="#8FB8DA"/> <path d="M55 204 L65 204 M60 199 L60 209" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M79 204 L89 204 M84 199 L84 209" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M103 204 L113 204 M108 199 L108 209" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M127 204 L137 204 M132 199 L132 209" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M151 204 L161 204 M156 199 L156 209" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M175 204 L185 204 M180 199 L180 209" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M199 204 L209 204 M204 199 L204 209" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M223 204 L233 204 M228 199 L228 209" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M247 204 L257 204 M252 199 L252 209" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M271 204 L281 204 M276 199 L276 209" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M295 204 L305 204 M300 199 L300 209" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M319 204 L329 204 M324 199 L324 209" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M67 228 L77 228 M72 223 L72 233" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M91 228 L101 228 M96 223 L96 233" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M115 228 L125 228 M120 223 L120 233" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M139 228 L149 228 M144 223 L144 233" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M163 228 L173 228 M168 223 L168 233" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M187 228 L197 228 M192 223 L192 233" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M211 228 L221 228 M216 223 L216 233" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M235 228 L245 228 M240 223 L240 233" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M259 228 L269 228 M264 223 L264 233" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M283 228 L293 228 M288 223 L288 233" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M307 228 L317 228 M312 223 L312 233" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M331 228 L341 228 M336 223 L336 233" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M55 252 L65 252 M60 247 L60 257" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M79 252 L89 252 M84 247 L84 257" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M103 252 L113 252 M108 247 L108 257" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M127 252 L137 252 M132 247 L132 257" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M151 252 L161 252 M156 247 L156 257" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M175 252 L185 252 M180 247 L180 257" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M199 252 L209 252 M204 247 L204 257" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M223 252 L233 252 M228 247 L228 257" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M247 252 L257 252 M252 247 L252 257" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M271 252 L281 252 M276 247 L276 257" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M295 252 L305 252 M300 247 L300 257" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M319 252 L329 252 M324 247 L324 257" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M67 276 L77 276 M72 271 L72 281" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M91 276 L101 276 M96 271 L96 281" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M115 276 L125 276 M120 271 L120 281" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M139 276 L149 276 M144 271 L144 281" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M163 276 L173 276 M168 271 L168 281" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M187 276 L197 276 M192 271 L192 281" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M211 276 L221 276 M216 271 L216 281" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M235 276 L245 276 M240 271 L240 281" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M259 276 L269 276 M264 271 L264 281" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M283 276 L293 276 M288 271 L288 281" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M307 276 L317 276 M312 271 L312 281" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M331 276 L341 276 M336 271 L336 281" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M55 300 L65 300 M60 295 L60 305" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M79 300 L89 300 M84 295 L84 305" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M103 300 L113 300 M108 295 L108 305" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M127 300 L137 300 M132 295 L132 305" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M151 300 L161 300 M156 295 L156 305" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M175 300 L185 300 M180 295 L180 305" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M199 300 L209 300 M204 295 L204 305" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M223 300 L233 300 M228 295 L228 305" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M247 300 L257 300 M252 295 L252 305" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M271 300 L281 300 M276 295 L276 305" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M295 300 L305 300 M300 295 L300 305" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M319 300 L329 300 M324 295 L324 305" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M67 324 L77 324 M72 319 L72 329" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M91 324 L101 324 M96 319 L96 329" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M115 324 L125 324 M120 319 L120 329" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M139 324 L149 324 M144 319 L144 329" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M163 324 L173 324 M168 319 L168 329" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M187 324 L197 324 M192 319 L192 329" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M211 324 L221 324 M216 319 L216 329" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M235 324 L245 324 M240 319 L240 329" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M259 324 L269 324 M264 319 L264 329" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M283 324 L293 324 M288 319 L288 329" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M307 324 L317 324 M312 319 L312 329" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M331 324 L341 324 M336 319 L336 329" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M55 348 L65 348 M60 343 L60 353" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M79 348 L89 348 M84 343 L84 353" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M103 348 L113 348 M108 343 L108 353" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M127 348 L137 348 M132 343 L132 353" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M151 348 L161 348 M156 343 L156 353" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M175 348 L185 348 M180 343 L180 353" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M199 348 L209 348 M204 343 L204 353" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M223 348 L233 348 M228 343 L228 353" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M247 348 L257 348 M252 343 L252 353" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M271 348 L281 348 M276 343 L276 353" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M295 348 L305 348 M300 343 L300 353" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/><path d="M319 348 L329 348 M324 343 L324 353" stroke="#F4F8FB" stroke-width="3" stroke-linecap="round"/> <path d="M106 190 L196 300" stroke="#2C4A6E" stroke-width="12"/> <path d="M232 190 L168 282" stroke="#2C4A6E" stroke-width="12"/> <path d="M52 296 Q190 290 340 300 L340 330 Q190 320 52 328 Z" fill="#E7B54A"/> <path d="M52 306 Q190 300 340 310" stroke="#C9922C" stroke-width="3" fill="none"/>`,
    top: ``,
  },
  {
    id: 'body_aloha',
    slot: 'body',
    name: 'アロハシャツ',
    wear: `<path d="M50 197 Q104 186 160 192 Q218 198 272 191 L282 256 Q318 262 336 284 Q348 318 330 346 Q300 368 240 366 Q190 370 150 362 L50 362 Z" fill="#E9874E"/> <ellipse cx="118" cy="232" rx="14" ry="6" transform="rotate(30 118 232)" fill="#3F8A5A"/><ellipse cx="236" cy="300" rx="14" ry="6" transform="rotate(-20 236 300)" fill="#3F8A5A"/><ellipse cx="150" cy="336" rx="14" ry="6" transform="rotate(10 150 336)" fill="#3F8A5A"/><ellipse cx="300" cy="322" rx="14" ry="6" transform="rotate(60 300 322)" fill="#3F8A5A"/> <ellipse cx="115.9" cy="254.8" rx="13.5" ry="9.4" transform="rotate(10 115.9 254.8)" fill="#F8E3C6"/><ellipse cx="102.2" cy="268.0" rx="13.5" ry="9.4" transform="rotate(82 102.2 268.0)" fill="#F8E3C6"/><ellipse cx="85.5" cy="259.1" rx="13.5" ry="9.4" transform="rotate(154 85.5 259.1)" fill="#F8E3C6"/><ellipse cx="88.8" cy="240.4" rx="13.5" ry="9.4" transform="rotate(226 88.8 240.4)" fill="#F8E3C6"/><ellipse cx="107.6" cy="237.8" rx="13.5" ry="9.4" transform="rotate(298 107.6 237.8)" fill="#F8E3C6"/><circle cx="100" cy="252" r="5.7" fill="#C8372D"/><ellipse cx="216.4" cy="244.8" rx="11.4" ry="7.9" transform="rotate(40 216.4 244.8)" fill="#F8E3C6"/><ellipse cx="200.9" cy="248.6" rx="11.4" ry="7.9" transform="rotate(112 200.9 248.6)" fill="#F8E3C6"/><ellipse cx="192.4" cy="235.0" rx="11.4" ry="7.9" transform="rotate(184 192.4 235.0)" fill="#F8E3C6"/><ellipse cx="202.7" cy="222.8" rx="11.4" ry="7.9" transform="rotate(256 202.7 222.8)" fill="#F8E3C6"/><ellipse cx="217.6" cy="228.8" rx="11.4" ry="7.9" transform="rotate(328 217.6 228.8)" fill="#F8E3C6"/><circle cx="206" cy="236" r="4.8" fill="#C8372D"/><ellipse cx="276.9" cy="318.0" rx="12.5" ry="8.6" transform="rotate(0 276.9 318.0)" fill="#F8E3C6"/><ellipse cx="266.6" cy="332.2" rx="12.5" ry="8.6" transform="rotate(72 266.6 332.2)" fill="#F8E3C6"/><ellipse cx="250.0" cy="326.7" rx="12.5" ry="8.6" transform="rotate(144 250.0 326.7)" fill="#F8E3C6"/><ellipse cx="250.0" cy="309.3" rx="12.5" ry="8.6" transform="rotate(216 250.0 309.3)" fill="#F8E3C6"/><ellipse cx="266.6" cy="303.8" rx="12.5" ry="8.6" transform="rotate(288 266.6 303.8)" fill="#F8E3C6"/><circle cx="262" cy="318" r="5.3" fill="#C8372D"/><ellipse cx="132.2" cy="340.7" rx="10.4" ry="7.2" transform="rotate(60 132.2 340.7)" fill="#F8E3C6"/><ellipse cx="117.7" cy="339.2" rx="10.4" ry="7.2" transform="rotate(132 117.7 339.2)" fill="#F8E3C6"/><ellipse cx="114.7" cy="325.0" rx="10.4" ry="7.2" transform="rotate(204 114.7 325.0)" fill="#F8E3C6"/><ellipse cx="127.3" cy="317.7" rx="10.4" ry="7.2" transform="rotate(276 127.3 317.7)" fill="#F8E3C6"/><ellipse cx="138.1" cy="327.4" rx="10.4" ry="7.2" transform="rotate(348 138.1 327.4)" fill="#F8E3C6"/><circle cx="126" cy="330" r="4.4" fill="#C8372D"/><ellipse cx="205.3" cy="351.4" rx="8.3" ry="5.8" transform="rotate(20 205.3 351.4)" fill="#F8E3C6"/><ellipse cx="195.7" cy="357.9" rx="8.3" ry="5.8" transform="rotate(92 195.7 357.9)" fill="#F8E3C6"/><ellipse cx="186.5" cy="350.7" rx="8.3" ry="5.8" transform="rotate(164 186.5 350.7)" fill="#F8E3C6"/><ellipse cx="190.5" cy="339.8" rx="8.3" ry="5.8" transform="rotate(236 190.5 339.8)" fill="#F8E3C6"/><ellipse cx="202.1" cy="340.2" rx="8.3" ry="5.8" transform="rotate(308 202.1 340.2)" fill="#F8E3C6"/><circle cx="196" cy="348" r="3.5" fill="#C8372D"/> <path d="M112 191 L150 230 L160 191 M210 191 L172 230 L162 191" fill="#F09A64" stroke="#C86A35" stroke-width="3" stroke-linejoin="round"/>`,
    top: ``,
  },
  {
    id: 'body_hoodie',
    slot: 'body',
    name: 'パーカー',
    wear: `<path d="M50 197 Q104 186 160 192 Q218 198 272 191 L282 256 Q318 262 336 284 Q348 318 330 346 Q300 368 240 366 Q190 370 150 362 L50 362 Z" fill="#7E9C8C"/> <path d="M206 186 Q262 182 266 212 Q246 228 214 222 Z" fill="#6A8878"/> <path d="M96 302 Q150 292 206 302 L212 346 Q150 352 92 346 Z" fill="#6A8878"/> <path d="M136 196 L132 248 M164 198 L166 252" stroke="#F4F1EA" stroke-width="4" stroke-linecap="round"/> <circle cx="132" cy="252" r="4" fill="#F4F1EA"/><circle cx="166" cy="256" r="4" fill="#F4F1EA"/>`,
    top: ``,
  },
  {
    id: 'body_jersey',
    slot: 'body',
    name: 'ジャージ',
    wear: `<path d="M50 197 Q104 186 160 192 Q218 198 272 191 L282 256 Q318 262 336 284 Q348 318 330 346 Q300 368 240 366 Q190 370 150 362 L50 362 Z" fill="#8A2E3F"/> <path d="M60 191 L262 191 L262 206 Q160 202 60 206 Z" fill="#6E2232"/> <path d="M122 191 L130 364" stroke="#D9D2C6" stroke-width="4"/> <path d="M186 244 L326 300 M180 256 L320 312" stroke="#F6F3EC" stroke-width="6" stroke-linecap="round"/>`,
    top: ``,
  },
  {
    id: 'body_gold',
    slot: 'body',
    name: '黄金の衣',
    wear: `<path d="M50 197 Q104 186 160 192 Q218 198 272 191 L282 256 Q318 262 336 284 Q348 318 330 346 Q300 368 240 366 Q190 370 150 362 L50 362 Z" fill="#D9A93A"/> <path d="M60 230 Q160 210 280 250 L280 266 Q160 228 60 248 Z" fill="#F1CE6A"/> <path d="M60 300 Q170 280 330 320 L326 334 Q170 296 60 316 Z" fill="#F1CE6A"/> <path d="M60 340 Q170 330 300 356" stroke="#B9862A" stroke-width="5" fill="none"/> <path d="M128 214 L131.0 223.0 L140 226 L131.0 229.0 L128 238 L125.0 229.0 L116 226 L125.0 223.0 Z" fill="#FFF7D6"/><path d="M236 277 L238.2 283.8 L245 286 L238.2 288.2 L236 295 L233.8 288.2 L227 286 L233.8 283.8 Z" fill="#FFF7D6"/><path d="M164 320 L166.5 327.5 L174 330 L166.5 332.5 L164 340 L161.5 332.5 L154 330 L161.5 327.5 Z" fill="#FFF7D6"/><path d="M300 319 L301.8 324.2 L307 326 L301.8 327.8 L300 333 L298.2 327.8 L293 326 L298.2 324.2 Z" fill="#FFF7D6"/>`,
    top: ``,
  },
  {
    id: 'body_pumpkin',
    event: 'halloween2026', // イベントで配る限定品（ガチャからは出ない）
    slot: 'body',
    name: 'かぼちゃ',
    wear: `<path d="M50 197 Q104 186 160 192 Q218 198 272 191 L282 256 Q318 262 336 284 Q348 318 330 346 Q300 368 240 366 Q190 370 150 362 L50 362 Z" fill="#EE8A2E"/> <path d="M110 200 Q96 280 110 362" stroke="#C9661E" stroke-width="4" fill="none"/><path d="M150 200 Q136 280 150 362" stroke="#C9661E" stroke-width="4" fill="none"/><path d="M190 200 Q204 280 190 362" stroke="#C9661E" stroke-width="4" fill="none"/><path d="M230 200 Q244 280 230 362" stroke="#C9661E" stroke-width="4" fill="none"/><path d="M270 200 Q284 280 270 362" stroke="#C9661E" stroke-width="4" fill="none"/> <path d="M104 236 L126 222 L130 248 Z M150 226 L172 214 L176 240 Z" fill="#3A2412"/> <path d="M100 286 Q140 316 196 284 L188 300 L176 292 L164 306 L150 294 L136 306 L124 294 L110 300 Z" fill="#3A2412"/>`,
    top: ``,
  },
  {
    id: 'body_pajama',
    slot: 'body',
    name: 'パジャマ',
    wear: `<path d="M50 197 Q104 186 160 192 Q218 198 272 191 L282 256 Q318 262 336 284 Q348 318 330 346 Q300 368 240 366 Q190 370 150 362 L50 362 Z" fill="#BFD3EE"/> <path d="M110.0 221.0 L112.4 226.7 L118.6 227.2 L113.9 231.3 L115.3 237.3 L110.0 234.1 L104.7 237.3 L106.1 231.3 L101.4 227.2 L107.6 226.7 Z" fill="#FFF6C9"/><path d="M206.0 219.0 L207.9 223.5 L212.7 223.8 L209.0 227.0 L210.1 231.7 L206.0 229.2 L201.9 231.7 L203.0 227.0 L199.3 223.8 L204.1 223.5 Z" fill="#FFF6C9"/><path d="M150.0 268.0 L152.1 273.1 L157.6 273.5 L153.4 277.1 L154.7 282.5 L150.0 279.6 L145.3 282.5 L146.6 277.1 L142.4 273.5 L147.9 273.1 Z" fill="#FFF6C9"/><path d="M250.0 291.0 L252.4 296.7 L258.6 297.2 L253.9 301.3 L255.3 307.3 L250.0 304.1 L244.7 307.3 L246.1 301.3 L241.4 297.2 L247.6 296.7 Z" fill="#FFF6C9"/><path d="M120.0 323.0 L121.9 327.5 L126.7 327.8 L123.0 331.0 L124.1 335.7 L120.0 333.1 L115.9 335.7 L117.0 331.0 L113.3 327.8 L118.1 327.5 Z" fill="#FFF6C9"/><path d="M206.0 332.0 L208.1 337.1 L213.6 337.5 L209.4 341.1 L210.7 346.5 L206.0 343.6 L201.3 346.5 L202.6 341.1 L198.4 337.5 L203.9 337.1 Z" fill="#FFF6C9"/><path d="M300.0 324.0 L301.6 327.8 L305.7 328.1 L302.6 330.8 L303.5 334.9 L300.0 332.7 L296.5 334.9 L297.4 330.8 L294.3 328.1 L298.4 327.8 Z" fill="#FFF6C9"/> <path d="M232 250 A16 16 0 1 0 252 272 A12 12 0 1 1 232 250 Z" fill="#FFF6C9"/> <path d="M124 196 L132 364" stroke="#9DB6DC" stroke-width="4"/> <circle cx="128.0" cy="224" r="5" fill="#FFFFFF"/><circle cx="129.6" cy="260" r="5" fill="#FFFFFF"/><circle cx="131.2" cy="296" r="5" fill="#FFFFFF"/><circle cx="132.8" cy="332" r="5" fill="#FFFFFF"/>`,
    top: ``,
  },
  {
    id: 'head_hachimaki',
    slot: 'head',
    name: 'ねじりハチマキ',
    wear: ``,
    top: `<path d="M70 58 Q160 40 250 56 L250 78 Q160 62 70 80 Z" fill="#F7F4EE" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/> <path d="M100 52 L110 76 M140 47 L150 70 M180 46 L190 68 M218 49 L228 72" stroke="#B9B4AA" stroke-width="2.5" stroke-linecap="round"/> <ellipse cx="252" cy="66" rx="13" ry="12" fill="#F7F4EE" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/> <path d="M262 60 Q284 44 296 30 L304 40 Q290 56 268 70 Z" fill="#F7F4EE" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/> <path d="M264 74 Q290 76 308 70 L310 82 Q288 90 262 84 Z" fill="#F7F4EE" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>`,
  },
  {
    id: 'head_crown',
    slot: 'head',
    name: '王冠',
    wear: ``,
    top: `<path d="M106 30 L100 -16 L131 8 L158 -30 L185 8 L216 -16 L212 30 Q160 38 106 30 Z" fill="#F2B53A" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/> <path d="M108 20 Q160 28 212 20" stroke="#2B2B2B" stroke-width="2.5" fill="none"/> <circle cx="158" cy="6" r="7" fill="#D64545" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/> <circle cx="128" cy="20" r="4.5" fill="#4C8BD6"/><circle cx="188" cy="20" r="4.5" fill="#4C8BD6"/> <circle cx="100" cy="-18" r="5" fill="#F2B53A" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/><circle cx="158" cy="-33" r="5" fill="#F2B53A" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/><circle cx="216" cy="-18" r="5" fill="#F2B53A" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>`,
  },
  {
    id: 'head_chef',
    slot: 'head',
    name: 'コック帽',
    wear: ``,
    top: `<path d="M98 26 Q70 -6 96 -34 Q102 -72 142 -64 Q162 -92 192 -68 Q232 -72 230 -32 Q254 -4 226 26 Z" fill="#FFFFFF" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/> <path d="M130 -30 Q134 0 132 22 M164 -44 Q166 -10 164 22 M198 -30 Q196 0 198 22" stroke="#C9C9C9" stroke-width="2.5" fill="none" stroke-linecap="round"/> <path d="M92 20 Q160 10 232 20 L234 52 Q160 42 90 52 Z" fill="#FFFFFF" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>`,
  },
  {
    id: 'head_straw',
    slot: 'head',
    name: '麦わら帽子',
    wear: ``,
    top: `<g transform="translate(0 14)"> <ellipse cx="162" cy="42" rx="128" ry="22" fill="#E9C877" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/> <path d="M102 42 Q98 -18 162 -22 Q226 -18 222 42 Z" fill="#E9C877" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/> <path d="M102 26 Q162 16 222 26 L222 42 Q162 32 102 42 Z" fill="#C8372D" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/> <path d="M60 40 Q90 50 120 52 M200 52 Q240 50 270 38 M130 -12 Q132 6 128 18 M190 -12 Q188 6 192 18" stroke="#C59B45" stroke-width="2.5" fill="none" stroke-linecap="round"/> </g>`,
  },
  {
    id: 'head_witch',
    event: 'halloween2026', // イベントで配る限定品（ガチャからは出ない）
    slot: 'head',
    name: '魔女の帽子',
    wear: ``,
    top: `<g transform="translate(0 10)"> <ellipse cx="160" cy="40" rx="124" ry="19" fill="#4B3A6B" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/> <path d="M104 36 Q128 -30 150 -66 Q172 -100 222 -98 Q190 -84 184 -50 Q196 -10 220 36 Z" fill="#4B3A6B" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/> <path d="M106 26 Q162 16 218 26 L220 38 Q162 30 104 38 Z" fill="#E58A2E" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/> <rect x="150" y="17" width="20" height="18" rx="2" fill="none" stroke="#F4D35E" stroke-width="3.5"/> <path d="M128 -14 l3 7 l7 1 l-5 5 l1 7 l-6 -3 l-6 3 l1 -7 l-5 -5 l7 -1 Z" fill="#F4D35E"/></g>`,
  },
  {
    id: 'head_naruto',
    slot: 'head',
    name: 'なるとのヘアピン',
    wear: ``,
    top: `<path d="M182 60 L238 44" stroke="#2B2B2B" stroke-width="9" stroke-linecap="round"/> <path d="M182 60 L238 44" stroke="#D9D9D9" stroke-width="4" stroke-linecap="round"/> <path d="M236.0 48.0 L232.6 52.7 L233.6 58.4 L228.5 61.2 L227.0 66.8 L221.2 67.0 L217.3 71.4 L212.0 69.1 L206.7 71.4 L202.8 67.0 L197.0 66.8 L195.5 61.2 L190.4 58.4 L191.4 52.7 L188.0 48.0 L191.4 43.3 L190.4 37.6 L195.5 34.8 L197.0 29.2 L202.8 29.0 L206.7 24.6 L212.0 26.9 L217.3 24.6 L221.2 29.0 L227.0 29.2 L228.5 34.8 L233.6 37.6 L232.6 43.3 Z" fill="#FBF7F2" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/><path d="M212.0 48.0 L212.3 48.1 L212.5 48.2 L212.6 48.5 L212.7 48.9 L212.6 49.2 L212.4 49.6 L212.0 49.9 L211.5 50.2 L210.9 50.3 L210.3 50.2 L209.6 49.9 L209.0 49.5 L208.5 48.8 L208.1 48.0 L207.9 47.1 L208.0 46.1 L208.3 45.1 L208.8 44.2 L209.7 43.3 L210.7 42.6 L211.9 42.2 L213.3 42.0 L214.7 42.2 L216.0 42.7 L217.3 43.6 L218.4 44.8 L219.2 46.2 L219.7 47.8 L219.9 49.6 L219.6 51.4 L218.8 53.2 L217.7 54.8 L216.2 56.1 L214.3 57.1 L212.3 57.7 L210.1 57.8 L207.8 57.3 L205.7 56.4 L203.8 55.0 L202.2 53.1 L201.0 50.9 L200.4 48.4 L200.3 45.7 L200.9 43.1 L202.0 40.6 L203.7 38.3 L205.9 36.5 L208.6 35.2 L211.5 34.5 L214.6 34.4 L217.6 35.1 L220.5 36.4 L223.1 38.4 L225.2 41.0 L226.7 44.0 L227.5 47.3 L227.5 50.8 L226.7 54.3 L225.2 57.6" stroke="#E5739A" stroke-width="3.8" fill="none" stroke-linecap="round"/>`,
  },
  {
    id: 'head_sunglasses',
    slot: 'head',
    name: 'サングラス',
    wear: ``,
    top: `<path d="M190 74 L242 70" stroke="#2B2B2B" stroke-width="5" stroke-linecap="round"/> <path d="M74 70 Q132 62 198 70 L196 90 Q182 108 150 102 Q136 96 128 96 Q118 104 92 104 Q76 98 74 70 Z" fill="#1E1E22" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/> <path d="M92 76 L104 92 M160 74 L172 90" stroke="#6B6B78" stroke-width="4" stroke-linecap="round"/>`,
  },
  {
    id: 'head_roundglasses',
    slot: 'head',
    name: '丸メガネ',
    wear: ``,
    top: `<path d="M188 84 L240 74" stroke="#2B2B2B" stroke-width="3.5" stroke-linecap="round"/> <circle cx="108" cy="88" r="20" fill="rgba(170,210,240,0.35)" stroke="#6B4A2B" stroke-width="5"/> <circle cx="166" cy="88" r="20" fill="rgba(170,210,240,0.35)" stroke="#6B4A2B" stroke-width="5"/> <path d="M128 86 Q137 80 146 86" stroke="#6B4A2B" stroke-width="5" fill="none"/> <path d="M98 80 L106 74 M156 80 L164 74" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"/>`,
  },
  {
    id: 'head_halo',
    slot: 'head',
    name: '天使の輪',
    wear: ``,
    top: `<ellipse cx="162" cy="-16" rx="62" ry="14" fill="none" stroke="#2B2B2B" stroke-width="13"/> <ellipse cx="162" cy="-16" rx="62" ry="14" fill="none" stroke="#F7D35A" stroke-width="7"/> <ellipse cx="162" cy="-16" rx="62" ry="14" fill="none" stroke="#FFF4C2" stroke-width="2"/>`,
  },
  {
    id: 'head_topknot',
    slot: 'head',
    name: 'ちょんまげ',
    wear: ``,
    top: `<path d="M220 28 Q214 10 194 6 L124 -8 Q100 -14 94 0 Q96 14 120 10 L186 20 Q200 24 204 34 Z" fill="#6A6A6A" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/> <path d="M106 -4 Q140 0 180 8" stroke="#8E8E8E" stroke-width="3" fill="none" stroke-linecap="round"/> <path d="M178 2 L194 6 L190 24 L174 20 Z" fill="#FFFFFF" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>`,
  },
  {
    id: 'head_gakubou',
    slot: 'head',
    name: '学生帽',
    wear: ``,
    top: `<path d="M94 46 Q88 -2 162 -6 Q236 -2 230 46 Z" fill="#24252C" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/> <path d="M96 34 Q162 26 228 34 L230 46 Q162 38 94 46 Z" fill="#1A1B20"/> <path d="M100 44 Q70 46 60 60 Q90 64 132 54 L130 42 Z" fill="#1A1B20" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/> <path d="M152 6 l10 -8 l10 8 l-4 12 l-12 0 Z" fill="#E3B341" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>`,
  },
  {
    id: 'head_beanie',
    slot: 'head',
    name: 'ニット帽',
    wear: ``,
    top: `<path d="M84 54 Q80 -12 162 -14 Q246 -12 240 54 Z" fill="#D9A441" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/> <path d="M110 7 Q112 20 110 40" stroke="#B9852B" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M128 4 Q130 20 128 40" stroke="#B9852B" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M146 1 Q148 20 146 40" stroke="#B9852B" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M164 -2 Q166 20 164 40" stroke="#B9852B" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M182 1 Q184 20 182 40" stroke="#B9852B" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M200 4 Q202 20 200 40" stroke="#B9852B" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M218 7 Q220 20 218 40" stroke="#B9852B" stroke-width="2.5" fill="none" stroke-linecap="round"/> <path d="M82 38 Q162 30 242 38 L242 60 Q162 52 82 60 Z" fill="#C38E30" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/> <path d="M92 38 L92 56" stroke="#9E7022" stroke-width="2"/><path d="M104 37 L104 56" stroke="#9E7022" stroke-width="2"/><path d="M116 38 L116 56" stroke="#9E7022" stroke-width="2"/><path d="M128 37 L128 56" stroke="#9E7022" stroke-width="2"/><path d="M140 38 L140 56" stroke="#9E7022" stroke-width="2"/><path d="M152 37 L152 56" stroke="#9E7022" stroke-width="2"/><path d="M164 38 L164 56" stroke="#9E7022" stroke-width="2"/><path d="M176 37 L176 56" stroke="#9E7022" stroke-width="2"/><path d="M188 38 L188 56" stroke="#9E7022" stroke-width="2"/><path d="M200 37 L200 56" stroke="#9E7022" stroke-width="2"/><path d="M212 38 L212 56" stroke="#9E7022" stroke-width="2"/><path d="M224 37 L224 56" stroke="#9E7022" stroke-width="2"/><path d="M236 38 L236 56" stroke="#9E7022" stroke-width="2"/> <circle cx="162" cy="-22" r="18" fill="#F3E9D2" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>`,
  },
  {
    id: 'head_flowers',
    slot: 'head',
    name: '花かんむり',
    wear: ``,
    top: `<path d="M84 40 Q162 16 240 40" stroke="#3F8A5A" stroke-width="6" fill="none" stroke-linecap="round"/> <ellipse cx="110" cy="34" rx="14" ry="6" transform="rotate(-30 110 34)" fill="#3F8A5A"/><ellipse cx="150" cy="24" rx="14" ry="6" transform="rotate(-10 150 24)" fill="#3F8A5A"/><ellipse cx="196" cy="26" rx="14" ry="6" transform="rotate(20 196 26)" fill="#3F8A5A"/><ellipse cx="228" cy="36" rx="14" ry="6" transform="rotate(40 228 36)" fill="#3F8A5A"/> <circle cx="94.0" cy="26.1" r="8.1" fill="#F5A3B8" stroke="#2B2B2B" stroke-width="2"/><circle cx="103.4" cy="32.9" r="8.1" fill="#F5A3B8" stroke="#2B2B2B" stroke-width="2"/><circle cx="99.8" cy="44.0" r="8.1" fill="#F5A3B8" stroke="#2B2B2B" stroke-width="2"/><circle cx="88.2" cy="44.0" r="8.1" fill="#F5A3B8" stroke="#2B2B2B" stroke-width="2"/><circle cx="84.6" cy="32.9" r="8.1" fill="#F5A3B8" stroke="#2B2B2B" stroke-width="2"/><circle cx="94" cy="36" r="5.4" fill="#F6C343" stroke="#2B2B2B" stroke-width="1.5"/><circle cx="130.0" cy="17.2" r="7.2" fill="#FFFFFF" stroke="#2B2B2B" stroke-width="2"/><circle cx="138.4" cy="23.3" r="7.2" fill="#FFFFFF" stroke="#2B2B2B" stroke-width="2"/><circle cx="135.2" cy="33.1" r="7.2" fill="#FFFFFF" stroke="#2B2B2B" stroke-width="2"/><circle cx="124.8" cy="33.1" r="7.2" fill="#FFFFFF" stroke="#2B2B2B" stroke-width="2"/><circle cx="121.6" cy="23.3" r="7.2" fill="#FFFFFF" stroke="#2B2B2B" stroke-width="2"/><circle cx="130" cy="26" r="4.8" fill="#F6C343" stroke="#2B2B2B" stroke-width="1.5"/><circle cx="166.0" cy="9.5" r="8.6" fill="#F7D35A" stroke="#2B2B2B" stroke-width="2"/><circle cx="175.9" cy="16.8" r="8.6" fill="#F7D35A" stroke="#2B2B2B" stroke-width="2"/><circle cx="172.1" cy="28.5" r="8.6" fill="#F7D35A" stroke="#2B2B2B" stroke-width="2"/><circle cx="159.9" cy="28.5" r="8.6" fill="#F7D35A" stroke="#2B2B2B" stroke-width="2"/><circle cx="156.1" cy="16.8" r="8.6" fill="#F7D35A" stroke="#2B2B2B" stroke-width="2"/><circle cx="166" cy="20" r="5.7" fill="#E58A2E" stroke="#2B2B2B" stroke-width="1.5"/><circle cx="204.0" cy="15.2" r="7.2" fill="#F5A3B8" stroke="#2B2B2B" stroke-width="2"/><circle cx="212.4" cy="21.3" r="7.2" fill="#F5A3B8" stroke="#2B2B2B" stroke-width="2"/><circle cx="209.2" cy="31.1" r="7.2" fill="#F5A3B8" stroke="#2B2B2B" stroke-width="2"/><circle cx="198.8" cy="31.1" r="7.2" fill="#F5A3B8" stroke="#2B2B2B" stroke-width="2"/><circle cx="195.6" cy="21.3" r="7.2" fill="#F5A3B8" stroke="#2B2B2B" stroke-width="2"/><circle cx="204" cy="24" r="4.8" fill="#F6C343" stroke="#2B2B2B" stroke-width="1.5"/><circle cx="236.0" cy="26.6" r="7.7" fill="#FFFFFF" stroke="#2B2B2B" stroke-width="2"/><circle cx="244.9" cy="33.1" r="7.7" fill="#FFFFFF" stroke="#2B2B2B" stroke-width="2"/><circle cx="241.5" cy="43.6" r="7.7" fill="#FFFFFF" stroke="#2B2B2B" stroke-width="2"/><circle cx="230.5" cy="43.6" r="7.7" fill="#FFFFFF" stroke="#2B2B2B" stroke-width="2"/><circle cx="227.1" cy="33.1" r="7.7" fill="#FFFFFF" stroke="#2B2B2B" stroke-width="2"/><circle cx="236" cy="36" r="5.1" fill="#F6C343" stroke="#2B2B2B" stroke-width="1.5"/>`,
  },
  {
    id: 'head_chopsticks',
    slot: 'head',
    name: '箸のかんざし',
    wear: ``,
    top: `<path d="M170 44 L262 -26" stroke="#2B2B2B" stroke-width="11" stroke-linecap="round"/><path d="M170 44 L262 -26" stroke="#B9824C" stroke-width="6" stroke-linecap="round"/><path d="M186 50 L284 -6" stroke="#2B2B2B" stroke-width="11" stroke-linecap="round"/><path d="M186 50 L284 -6" stroke="#B9824C" stroke-width="6" stroke-linecap="round"/> <path d="M248 -15 L262 -26 M270 4 L284 -6" stroke="#C8372D" stroke-width="5" stroke-linecap="round"/>`,
  },
  {
    id: 'head_headphones',
    slot: 'head',
    name: 'ヘッドホン',
    wear: ``,
    top: `<path d="M86 70 Q80 -4 162 -8 Q244 -4 238 70" fill="none" stroke="#2B2B2B" stroke-width="13" stroke-linecap="round"/> <path d="M86 70 Q80 -4 162 -8 Q244 -4 238 70" fill="none" stroke="#5B5F6B" stroke-width="7" stroke-linecap="round"/> <rect x="68" y="56" width="30" height="46" rx="12" fill="#E25B45" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/> <rect x="226" y="56" width="30" height="46" rx="12" fill="#E25B45" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>`,
  },
  {
    id: 'head_catears',
    slot: 'head',
    name: 'ねこみみ',
    wear: ``,
    top: `<path d="M96 34 L104 -22 L146 18 Z" fill="#BDBDBD" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/> <path d="M106 22 L109 -6 L132 16 Z" fill="#F2A7B8"/> <path d="M182 16 L224 -22 L234 34 Z" fill="#BDBDBD" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/> <path d="M196 14 L220 -6 L224 22 Z" fill="#F2A7B8"/>`,
  },
  {
    id: 'head_ribbon',
    slot: 'head',
    name: 'リボン',
    wear: ``,
    top: `<path d="M216 30 L196 66 L210 62 L216 78 L226 34 Z" fill="#C23E4C" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/> <path d="M228 32 L254 64 L240 64 L238 80 L222 36 Z" fill="#C23E4C" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/> <path d="M218 28 Q172 0 176 -22 Q192 -36 222 18 Z" fill="#D94B5A" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/> <path d="M228 28 Q276 4 276 -20 Q260 -34 228 18 Z" fill="#D94B5A" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/> <path d="M190 -14 Q204 0 214 16 M262 -14 Q248 0 236 16" stroke="#A8303D" stroke-width="2.5" fill="none" stroke-linecap="round"/> <ellipse cx="223" cy="24" rx="12" ry="14" fill="#E86272" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>`,
  },
  {
    id: 'head_devil',
    slot: 'head',
    name: '悪魔のつの',
    wear: ``,
    top: `<path d="M104 34 Q84 4 98 -26 Q106 -6 130 12 Z" fill="#B8352E" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/> <path d="M206 14 Q232 -2 236 -30 Q252 2 236 34 Z" fill="#B8352E" stroke="#2B2B2B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/> <path d="M100 -16 Q104 0 116 10 M234 -18 Q238 4 232 22" stroke="#E46A5E" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  },
];

export const outfitById = (id) => CHIKI_OUTFITS.find((o) => o.id === id) ?? null;

// 着ているもの（からだ・あたま）から、絵に重ねるSVGを作る。
// 返した文字列を、.chiki-body の中の img のすぐ後ろに入れる
export function outfitLayers(bodyId, headId) {
  const worn = [outfitById(bodyId), outfitById(headId)].filter(Boolean);
  if (!worn.length) return '';
  const wear = worn.map((o) => o.wear).join('');
  const top = worn.map((o) => o.top).join('');
  return (wear ? `<svg class="chiki-wear" viewBox="0 0 414 440" aria-hidden="true">${wear}</svg>` : '')
    + (top ? `<svg class="chiki-top" viewBox="0 0 414 440" aria-hidden="true">${top}</svg>` : '');
}
