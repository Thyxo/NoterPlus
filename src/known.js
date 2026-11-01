// Færdige tabeller for kendte fonte – kun bogstav → tal, ikke selve fonten.
// Aflæst visuelt fra Cryptext 2.5: hvert bogstav drejet 180°, og hvilket tal det ligner.
// score: 0,9 = tydeligt, 0,5 = kan bruges, men ser mindre overbevisende ud.

const strong = 'A8 B8 D0 E3 F1 G9 I1 L7 N4 O0 Q0 R21 S5 T1 V1 Y3 Z2 a0 b9 f8 g6 h4 i1 k71 l1 m41 n4 o0 q6 r1 s5 t7 u0 v1 y5 z2';
const weak = 'C0 H4 J1 K71 M41 P0 U0 W14 X4 c0 d9 e2 j1 p0 w14 x4';

function table(list, score, map, scores) {
  for (const item of list.split(' ')) {
    map[item[0]] = item.slice(1);
    scores[item[0]] = score;
  }
}

const map = {};
const scores = {};
table(strong, 0.9, map, scores);
table(weak, 0.5, map, scores);

export const KNOWN_FONTS = [
  { match: /cryptext/i, letterRot: 'rotated', map, scores },
];
