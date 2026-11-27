// VN-CAT-007, ADR-0007: SGP4/SDP4 for GP (two-line or OMM) mean elements, written from the published algorithm:
// Hoots and Roehrich, Spacetrack Report No. 3 (1980), with the corrections and the structure of Vallado, Crawford,
// Hujsak and Kelso, "Revisiting Spacetrack Report #3", AIAA 2006-6753 ("improved" mode, WGS-72 constants, the
// constants GP elements are fitted with). Output is TEME (true equator, mean equinox) position in km and velocity in
// km/s from Earth's centre. Checked against the paper's verification vectors (src/core/sgp4/sgp4.test.ts). Pure:
// `initialize` allocates one record; `propagate` writes into a caller array and allocates nothing.

const TWO_PI = 2 * Math.PI;
const DEG = Math.PI / 180;
const X2O3 = 2 / 3;

/** WGS-72 (the constants of GP element sets). */
export const WGS72 = {
  mu: 398600.8, // km^3/s^2
  radiusKm: 6378.135,
  j2: 0.001082616,
  j3: -0.00000253881,
  j4: -0.00000165597,
} as const;

const RE = WGS72.radiusKm;
const XKE = 60 / Math.sqrt((RE * RE * RE) / WGS72.mu);
const TUMIN = 1 / XKE;
const J2 = WGS72.j2;
const J3 = WGS72.j3;
const J4 = WGS72.j4;
const J3OJ2 = J3 / J2;
const VKMPERSEC = (RE * XKE) / 60;

/** Mean elements of one GP element set, in the units the propagator takes. */
export interface MeanElements {
  /** Epoch as days since 1949 December 31 00:00 UT (Julian date - 2433281.5). */
  epochDays1950: number;
  /** Drag term B*, 1/earth radii. */
  bstar: number;
  /** Inclination, node, eccentricity, argument of perigee, mean anomaly: rad and unitless. */
  inclo: number;
  nodeo: number;
  ecco: number;
  argpo: number;
  mo: number;
  /** Mean motion, rad/min (Kozai, as in the element set). */
  noKozai: number;
}

/** A satellite record after initialisation; read only. */
export interface Satrec {
  readonly error: number;
  readonly method: "n" | "d";
  readonly epochDays1950: number;
}

/** Internal record: a flat object of numbers so propagation allocates nothing. */
interface Rec {
  error: number;
  /** Operation mode "a" (AFSPC, as the reference vectors were run) rather than "i" (improved). */
  afspc: boolean;
  isimp: number;
  method: "n" | "d";
  aycof: number;
  con41: number;
  cc1: number;
  cc4: number;
  cc5: number;
  d2: number;
  d3: number;
  d4: number;
  delmo: number;
  eta: number;
  argpdot: number;
  omgcof: number;
  sinmao: number;
  t2cof: number;
  t3cof: number;
  t4cof: number;
  t5cof: number;
  x1mth2: number;
  x7thm1: number;
  mdot: number;
  nodedot: number;
  xlcof: number;
  xmcof: number;
  nodecf: number;
  irez: number;
  d2201: number;
  d2211: number;
  d3210: number;
  d3222: number;
  d4410: number;
  d4422: number;
  d5220: number;
  d5232: number;
  d5421: number;
  d5433: number;
  dedt: number;
  del1: number;
  del2: number;
  del3: number;
  didt: number;
  dmdt: number;
  dnodt: number;
  domdt: number;
  e3: number;
  ee2: number;
  peo: number;
  pgho: number;
  pho: number;
  pinco: number;
  plo: number;
  se2: number;
  se3: number;
  sgh2: number;
  sgh3: number;
  sgh4: number;
  sh2: number;
  sh3: number;
  si2: number;
  si3: number;
  sl2: number;
  sl3: number;
  sl4: number;
  gsto: number;
  xfact: number;
  xgh2: number;
  xgh3: number;
  xgh4: number;
  xh2: number;
  xh3: number;
  xi2: number;
  xi3: number;
  xl2: number;
  xl3: number;
  xl4: number;
  xlamo: number;
  zmol: number;
  zmos: number;
  atime: number;
  xli: number;
  xni: number;
  bstar: number;
  ecco: number;
  argpo: number;
  inclo: number;
  mo: number;
  no: number;
  nodeo: number;
  epochDays1950: number;
}

/** Greenwich mean sidereal time (rad) at a UT1 Julian date (IAU 1982, as SGP4 uses). */
export function gstime(jdut1: number): number {
  const tut1 = (jdut1 - 2451545.0) / 36525.0;
  let temp =
    -6.2e-6 * tut1 * tut1 * tut1 + 0.093104 * tut1 * tut1 + (876600.0 * 3600 + 8640184.812866) * tut1 + 67310.54841;
  temp = ((temp * DEG) / 240.0) % TWO_PI;
  if (temp < 0) temp += TWO_PI;
  return temp;
}

/** Deep-space common terms (dscom). */
function dscom(epoch: number, ep: number, argpp: number, tc: number, inclp: number, nodep: number, np: number) {
  const zes = 0.01675;
  const zel = 0.0549;
  const c1ss = 2.9864797e-6;
  const c1l = 4.7968065e-7;
  const zsinis = 0.39785416;
  const zcosis = 0.91744867;
  const zcosgs = 0.1945905;
  const zsings = -0.98088458;

  const nm = np;
  const em = ep;
  const snodm = Math.sin(nodep);
  const cnodm = Math.cos(nodep);
  const sinomm = Math.sin(argpp);
  const cosomm = Math.cos(argpp);
  const sinim = Math.sin(inclp);
  const cosim = Math.cos(inclp);
  const emsq = em * em;
  const betasq = 1 - emsq;
  const rtemsq = Math.sqrt(betasq);

  const peo = 0;
  const pinco = 0;
  const plo = 0;
  const pgho = 0;
  const pho = 0;
  const day = epoch + 18261.5 + tc / 1440.0;
  const xnodce = (4.523602 - 9.2422029e-4 * day) % TWO_PI;
  const stem = Math.sin(xnodce);
  const ctem = Math.cos(xnodce);
  const zcosil = 0.91375164 - 0.03568096 * ctem;
  const zsinil = Math.sqrt(1 - zcosil * zcosil);
  const zsinhl = (0.089683511 * stem) / zsinil;
  const zcoshl = Math.sqrt(1 - zsinhl * zsinhl);
  const gam = 5.8351514 + 0.001944368 * day;
  let zx = (0.39785416 * stem) / zsinil;
  const zy = zcoshl * ctem + 0.91744867 * zsinhl * stem;
  zx = Math.atan2(zx, zy);
  zx = gam + zx - xnodce;
  const zcosgl = Math.cos(zx);
  const zsingl = Math.sin(zx);

  let zcosg = zcosgs;
  let zsing = zsings;
  let zcosi = zcosis;
  let zsini = zsinis;
  let zcosh = cnodm;
  let zsinh = snodm;
  let cc = c1ss;
  const xnoi = 1 / nm;

  const out = {
    snodm,
    cnodm,
    sinomm,
    cosomm,
    sinim,
    cosim,
    emsq,
    rtemsq,
    nm,
    em,
    peo,
    pinco,
    plo,
    pgho,
    pho,
    day,
    gam,
    s1: 0,
    s2: 0,
    s3: 0,
    s4: 0,
    s5: 0,
    s6: 0,
    s7: 0,
    ss1: 0,
    ss2: 0,
    ss3: 0,
    ss4: 0,
    ss5: 0,
    ss6: 0,
    ss7: 0,
    sz1: 0,
    sz2: 0,
    sz3: 0,
    sz11: 0,
    sz12: 0,
    sz13: 0,
    sz21: 0,
    sz22: 0,
    sz23: 0,
    sz31: 0,
    sz32: 0,
    sz33: 0,
    z1: 0,
    z2: 0,
    z3: 0,
    z11: 0,
    z12: 0,
    z13: 0,
    z21: 0,
    z22: 0,
    z23: 0,
    z31: 0,
    z32: 0,
    z33: 0,
    e3: 0,
    ee2: 0,
    se2: 0,
    se3: 0,
    sgh2: 0,
    sgh3: 0,
    sgh4: 0,
    sh2: 0,
    sh3: 0,
    si2: 0,
    si3: 0,
    sl2: 0,
    sl3: 0,
    sl4: 0,
    xgh2: 0,
    xgh3: 0,
    xgh4: 0,
    xh2: 0,
    xh3: 0,
    xi2: 0,
    xi3: 0,
    xl2: 0,
    xl3: 0,
    xl4: 0,
    zmol: 0,
    zmos: 0,
  };

  for (let lsflg = 1; lsflg <= 2; lsflg++) {
    const a1 = zcosg * zcosh + zsing * zcosi * zsinh;
    const a3 = -zsing * zcosh + zcosg * zcosi * zsinh;
    const a7 = -zcosg * zsinh + zsing * zcosi * zcosh;
    const a8 = zsing * zsini;
    const a9 = zsing * zsinh + zcosg * zcosi * zcosh;
    const a10 = zcosg * zsini;
    const a2 = cosim * a7 + sinim * a8;
    const a4 = cosim * a9 + sinim * a10;
    const a5 = -sinim * a7 + cosim * a8;
    const a6 = -sinim * a9 + cosim * a10;

    const x1 = a1 * cosomm + a2 * sinomm;
    const x2 = a3 * cosomm + a4 * sinomm;
    const x3 = -a1 * sinomm + a2 * cosomm;
    const x4 = -a3 * sinomm + a4 * cosomm;
    const x5 = a5 * sinomm;
    const x6 = a6 * sinomm;
    const x7 = a5 * cosomm;
    const x8 = a6 * cosomm;

    const z31 = 12 * x1 * x1 - 3 * x3 * x3;
    const z32 = 24 * x1 * x2 - 6 * x3 * x4;
    const z33 = 12 * x2 * x2 - 3 * x4 * x4;
    let z1 = 3 * (a1 * a1 + a2 * a2) + z31 * emsq;
    let z2 = 6 * (a1 * a3 + a2 * a4) + z32 * emsq;
    let z3 = 3 * (a3 * a3 + a4 * a4) + z33 * emsq;
    const z11 = -6 * a1 * a5 + emsq * (-24 * x1 * x7 - 6 * x3 * x5);
    const z12 = -6 * (a1 * a6 + a3 * a5) + emsq * (-24 * (x2 * x7 + x1 * x8) - 6 * (x3 * x6 + x4 * x5));
    const z13 = -6 * a3 * a6 + emsq * (-24 * x2 * x8 - 6 * x4 * x6);
    const z21 = 6 * a2 * a5 + emsq * (24 * x1 * x5 - 6 * x3 * x7);
    const z22 = 6 * (a4 * a5 + a2 * a6) + emsq * (24 * (x2 * x5 + x1 * x6) - 6 * (x4 * x7 + x3 * x8));
    const z23 = 6 * a4 * a6 + emsq * (24 * x2 * x6 - 6 * x4 * x8);
    z1 = z1 + z1 + betasq * z31;
    z2 = z2 + z2 + betasq * z32;
    z3 = z3 + z3 + betasq * z33;
    const s3 = cc * xnoi;
    const s2 = (-0.5 * s3) / rtemsq;
    const s4 = s3 * rtemsq;
    const s1 = -15 * em * s4;
    const s5 = x1 * x3 + x2 * x4;
    const s6 = x2 * x3 + x1 * x4;
    const s7 = x2 * x4 - x1 * x3;

    if (lsflg === 1) {
      out.ss1 = s1;
      out.ss2 = s2;
      out.ss3 = s3;
      out.ss4 = s4;
      out.ss5 = s5;
      out.ss6 = s6;
      out.ss7 = s7;
      out.sz1 = z1;
      out.sz2 = z2;
      out.sz3 = z3;
      out.sz11 = z11;
      out.sz12 = z12;
      out.sz13 = z13;
      out.sz21 = z21;
      out.sz22 = z22;
      out.sz23 = z23;
      out.sz31 = z31;
      out.sz32 = z32;
      out.sz33 = z33;
      zcosg = zcosgl;
      zsing = zsingl;
      zcosi = zcosil;
      zsini = zsinil;
      zcosh = zcoshl * cnodm + zsinhl * snodm;
      zsinh = snodm * zcoshl - cnodm * zsinhl;
      cc = c1l;
    } else {
      out.s1 = s1;
      out.s2 = s2;
      out.s3 = s3;
      out.s4 = s4;
      out.s5 = s5;
      out.s6 = s6;
      out.s7 = s7;
      out.z1 = z1;
      out.z2 = z2;
      out.z3 = z3;
      out.z11 = z11;
      out.z12 = z12;
      out.z13 = z13;
      out.z21 = z21;
      out.z22 = z22;
      out.z23 = z23;
      out.z31 = z31;
      out.z32 = z32;
      out.z33 = z33;
    }
  }

  out.zmol = (4.7199672 + (0.2299715 * day - gam)) % TWO_PI;
  out.zmos = (6.2565837 + 0.017201977 * day) % TWO_PI;

  // Solar terms
  out.se2 = 2 * out.ss1 * out.ss6;
  out.se3 = 2 * out.ss1 * out.ss7;
  out.si2 = 2 * out.ss2 * out.sz12;
  out.si3 = 2 * out.ss2 * (out.sz13 - out.sz11);
  out.sl2 = -2 * out.ss3 * out.sz2;
  out.sl3 = -2 * out.ss3 * (out.sz3 - out.sz1);
  out.sl4 = -2 * out.ss3 * (-21 - 9 * emsq) * zes;
  out.sgh2 = 2 * out.ss4 * out.sz32;
  out.sgh3 = 2 * out.ss4 * (out.sz33 - out.sz31);
  out.sgh4 = -18 * out.ss4 * zes;
  out.sh2 = -2 * out.ss2 * out.sz22;
  out.sh3 = -2 * out.ss2 * (out.sz23 - out.sz21);

  // Lunar terms
  out.ee2 = 2 * out.s1 * out.s6;
  out.e3 = 2 * out.s1 * out.s7;
  out.xi2 = 2 * out.s2 * out.z12;
  out.xi3 = 2 * out.s2 * (out.z13 - out.z11);
  out.xl2 = -2 * out.s3 * out.z2;
  out.xl3 = -2 * out.s3 * (out.z3 - out.z1);
  out.xl4 = -2 * out.s3 * (-21 - 9 * emsq) * zel;
  out.xgh2 = 2 * out.s4 * out.z32;
  out.xgh3 = 2 * out.s4 * (out.z33 - out.z31);
  out.xgh4 = -18 * out.s4 * zel;
  out.xh2 = -2 * out.s2 * out.z22;
  out.xh3 = -2 * out.s2 * (out.z23 - out.z21);
  return out;
}

/** Deep-space long-period periodics (dpper), applied in place to the five elements in `el`. */
function dpper(rec: Rec, t: number, init: boolean, el: Float64Array): void {
  // el: [ep, inclp, nodep, argpp, mp]
  const zns = 1.19459e-5;
  const zes = 0.01675;
  const znl = 1.5835218e-4;
  const zel = 0.0549;

  let zm = init ? rec.zmos : rec.zmos + zns * t;
  let zf = zm + 2 * zes * Math.sin(zm);
  let sinzf = Math.sin(zf);
  let f2 = 0.5 * sinzf * sinzf - 0.25;
  let f3 = -0.5 * sinzf * Math.cos(zf);
  const ses = rec.se2 * f2 + rec.se3 * f3;
  const sis = rec.si2 * f2 + rec.si3 * f3;
  const sls = rec.sl2 * f2 + rec.sl3 * f3 + rec.sl4 * sinzf;
  const sghs = rec.sgh2 * f2 + rec.sgh3 * f3 + rec.sgh4 * sinzf;
  const shs = rec.sh2 * f2 + rec.sh3 * f3;
  zm = init ? rec.zmol : rec.zmol + znl * t;
  zf = zm + 2 * zel * Math.sin(zm);
  sinzf = Math.sin(zf);
  f2 = 0.5 * sinzf * sinzf - 0.25;
  f3 = -0.5 * sinzf * Math.cos(zf);
  const sel = rec.ee2 * f2 + rec.e3 * f3;
  const sil = rec.xi2 * f2 + rec.xi3 * f3;
  const sll = rec.xl2 * f2 + rec.xl3 * f3 + rec.xl4 * sinzf;
  const sghl = rec.xgh2 * f2 + rec.xgh3 * f3 + rec.xgh4 * sinzf;
  const shll = rec.xh2 * f2 + rec.xh3 * f3;
  let pe = ses + sel;
  let pinc = sis + sil;
  let pl = sls + sll;
  let pgh = sghs + sghl;
  let ph = shs + shll;

  if (init) return; // at initialisation the periodics are only computed, not applied (Vallado's "init" = 'y')

  pe -= rec.peo;
  pinc -= rec.pinco;
  pl -= rec.plo;
  pgh -= rec.pgho;
  ph -= rec.pho;
  el[1] = el[1]! + pinc;
  el[0] = el[0]! + pe;
  const sinip = Math.sin(el[1]!);
  const cosip = Math.cos(el[1]!);

  if (el[1]! >= 0.2) {
    ph /= sinip;
    pgh -= cosip * ph;
    el[3] = el[3]! + pgh;
    el[2] = el[2]! + ph;
    el[4] = el[4]! + pl;
  } else {
    // Lyddane modification for low inclination.
    const sinop = Math.sin(el[2]!);
    const cosop = Math.cos(el[2]!);
    let alfdp = sinip * sinop;
    let betdp = sinip * cosop;
    const dalf = ph * cosop + pinc * cosip * sinop;
    const dbet = -ph * sinop + pinc * cosip * cosop;
    alfdp += dalf;
    betdp += dbet;
    el[2] = el[2]! % TWO_PI;
    // AFSPC mode only: the node into 0..2 pi before and after the atan2 (AIAA 2006-6753, Lyddane choice).
    if (el[2]! < 0 && rec.afspc) el[2] = el[2]! + TWO_PI;
    let xls = el[4]! + el[3]! + cosip * el[2]!;
    const dls = pl + pgh - pinc * el[2]! * sinip;
    xls += dls;
    const xnoh = el[2]!;
    el[2] = Math.atan2(alfdp, betdp);
    if (el[2]! < 0 && rec.afspc) el[2] = el[2]! + TWO_PI;
    if (Math.abs(xnoh - el[2]!) > Math.PI) {
      el[2] = el[2]! < xnoh ? el[2]! + TWO_PI : el[2]! - TWO_PI;
    }
    el[4] = el[4]! + pl;
    el[3] = xls - el[4]! - cosip * el[2]!;
  }
}

/** Deep-space secular and resonance initialisation (dsinit). */
function dsinit(
  rec: Rec,
  ds: ReturnType<typeof dscom>,
  cosim: number,
  emsq: number,
  argpo: number,
  s1: number,
  s2: number,
  s3: number,
  s4: number,
  s5: number,
  sinim: number,
  ss1: number,
  ss2: number,
  ss3: number,
  ss4: number,
  ss5: number,
  sz1: number,
  sz3: number,
  sz11: number,
  sz13: number,
  sz21: number,
  sz23: number,
  sz31: number,
  sz33: number,
  t: number,
  tc: number,
  gsto: number,
  mo: number,
  mdot: number,
  no: number,
  nodeo: number,
  nodedot: number,
  xpidot: number,
  z1: number,
  z3: number,
  z11: number,
  z13: number,
  z21: number,
  z23: number,
  z31: number,
  z33: number,
  ecco: number,
  eccsq: number,
  emIn: number,
  argpmIn: number,
  inclmIn: number,
  mmIn: number,
  nmIn: number,
  nodemIn: number,
) {
  const q22 = 1.7891679e-6;
  const q31 = 2.1460748e-6;
  const q33 = 2.2123015e-7;
  const root22 = 1.7891679e-6;
  const root44 = 7.3636953e-9;
  const root54 = 2.1765803e-9;
  const rptim = 4.37526908801129966e-3;
  const root32 = 3.7393792e-7;
  const root52 = 1.1428639e-7;
  const znl = 1.5835218e-4;
  const zns = 1.19459e-5;

  let em = emIn;
  let argpm = argpmIn;
  let inclm = inclmIn;
  let mm = mmIn;
  let nm = nmIn;
  let nodem = nodemIn;

  rec.irez = 0;
  if (nm < 0.0052359877 && nm > 0.0034906585) rec.irez = 1;
  if (nm >= 8.26e-3 && nm <= 9.24e-3 && em >= 0.5) rec.irez = 2;

  // Solar terms.
  const ses = ss1 * zns * ss5;
  const sis = ss2 * zns * (sz11 + sz13);
  const sls = -zns * ss3 * (sz1 + sz3 - 14 - 6 * emsq);
  const sghs = ss4 * zns * (sz31 + sz33 - 6);
  let shs = -zns * ss2 * (sz21 + sz23);
  if (inclm < 5.2359877e-2 || inclm > Math.PI - 5.2359877e-2) shs = 0;
  if (sinim !== 0) shs /= sinim;
  const sgs = sghs - cosim * shs;

  // Lunar terms.
  rec.dedt = ses + s1 * znl * s5;
  rec.didt = sis + s2 * znl * (z11 + z13);
  rec.dmdt = sls - znl * s3 * (z1 + z3 - 14 - 6 * emsq);
  const sghl = s4 * znl * (z31 + z33 - 6);
  let shll = -znl * s2 * (z21 + z23);
  if (inclm < 5.2359877e-2 || inclm > Math.PI - 5.2359877e-2) shll = 0;
  rec.domdt = sgs + sghl;
  rec.dnodt = shs;
  if (sinim !== 0) {
    rec.domdt -= (cosim / sinim) * shll;
    rec.dnodt += shll / sinim;
  }

  // Secular effects of the deep-space terms up to time t.
  let dndt = 0;
  const theta = (gsto + tc * rptim) % TWO_PI;
  em += rec.dedt * t;
  inclm += rec.didt * t;
  argpm += rec.domdt * t;
  nodem += rec.dnodt * t;
  mm += rec.dmdt * t;

  if (rec.irez !== 0) {
    const aonv = Math.pow(nm / XKE, X2O3);

    if (rec.irez === 2) {
      // Geopotential resonance for 12-hour orbits.
      const cosisq = cosim * cosim;
      const emo = em;
      em = ecco;
      const emsqo = emsq;
      const emsq2 = eccsq;
      const eoc = em * emsq2;
      const g201 = -0.306 - (em - 0.64) * 0.44;
      let g211, g310, g322, g410, g422, g520, g521, g532, g533;
      if (em <= 0.65) {
        g211 = 3.616 - 13.247 * em + 16.29 * emsq2;
        g310 = -19.302 + 117.39 * em - 228.419 * emsq2 + 156.591 * eoc;
        g322 = -18.9068 + 109.7927 * em - 214.6334 * emsq2 + 146.5816 * eoc;
        g410 = -41.122 + 242.694 * em - 471.094 * emsq2 + 313.953 * eoc;
        g422 = -146.407 + 841.88 * em - 1629.014 * emsq2 + 1083.435 * eoc;
        g520 = -532.114 + 3017.977 * em - 5740.032 * emsq2 + 3708.276 * eoc;
      } else {
        g211 = -72.099 + 331.819 * em - 508.738 * emsq2 + 266.724 * eoc;
        g310 = -346.844 + 1582.851 * em - 2415.925 * emsq2 + 1246.113 * eoc;
        g322 = -342.585 + 1554.908 * em - 2366.899 * emsq2 + 1215.972 * eoc;
        g410 = -1052.797 + 4758.686 * em - 7193.992 * emsq2 + 3651.957 * eoc;
        g422 = -3581.69 + 16178.11 * em - 24462.77 * emsq2 + 12422.52 * eoc;
        g520 =
          em > 0.715
            ? -5149.66 + 29936.92 * em - 54087.36 * emsq2 + 31324.56 * eoc
            : 1464.74 - 4664.75 * em + 3763.64 * emsq2;
      }
      if (em < 0.7) {
        g533 = -919.2277 + 4988.61 * em - 9064.77 * emsq2 + 5542.21 * eoc;
        g521 = -822.71072 + 4568.6173 * em - 8491.4146 * emsq2 + 5337.524 * eoc;
        g532 = -853.666 + 4690.25 * em - 8624.77 * emsq2 + 5341.4 * eoc;
      } else {
        g533 = -37995.78 + 161616.52 * em - 229838.2 * emsq2 + 109377.94 * eoc;
        g521 = -51752.104 + 218913.95 * em - 309468.16 * emsq2 + 146349.42 * eoc;
        g532 = -40023.88 + 170470.89 * em - 242699.48 * emsq2 + 115605.82 * eoc;
      }
      const sini2 = sinim * sinim;
      const f220 = 0.75 * (1 + 2 * cosim + cosisq);
      const f221 = 1.5 * sini2;
      const f321 = 1.875 * sinim * (1 - 2 * cosim - 3 * cosisq);
      const f322 = -1.875 * sinim * (1 + 2 * cosim - 3 * cosisq);
      const f441 = 35 * sini2 * f220;
      const f442 = 39.375 * sini2 * sini2;
      const f522 =
        9.84375 * sinim * (sini2 * (1 - 2 * cosim - 5 * cosisq) + 0.33333333 * (-2 + 4 * cosim + 6 * cosisq));
      const f523 =
        sinim * (4.92187512 * sini2 * (-2 - 4 * cosim + 10 * cosisq) + 6.56250012 * (1 + 2 * cosim - 3 * cosisq));
      const f542 = 29.53125 * sinim * (2 - 8 * cosim + cosisq * (-12 + 8 * cosim + 10 * cosisq));
      const f543 = 29.53125 * sinim * (-2 - 8 * cosim + cosisq * (12 + 8 * cosim - 10 * cosisq));
      const xno2 = nm * nm;
      const ainv2 = aonv * aonv;
      let temp1 = 3 * xno2 * ainv2;
      let temp = temp1 * root22;
      rec.d2201 = temp * f220 * g201;
      rec.d2211 = temp * f221 * g211;
      temp1 *= aonv;
      temp = temp1 * root32;
      rec.d3210 = temp * f321 * g310;
      rec.d3222 = temp * f322 * g322;
      temp1 *= aonv;
      temp = 2 * temp1 * root44;
      rec.d4410 = temp * f441 * g410;
      rec.d4422 = temp * f442 * g422;
      temp1 *= aonv;
      temp = temp1 * root52;
      rec.d5220 = temp * f522 * g520;
      rec.d5232 = temp * f523 * g532;
      temp = 2 * temp1 * root54;
      rec.d5421 = temp * f542 * g521;
      rec.d5433 = temp * f543 * g533;
      rec.xlamo = (mo + nodeo + nodeo - (theta + theta)) % TWO_PI;
      rec.xfact = mdot + rec.dmdt + 2 * (nodedot + rec.dnodt - rptim) - no;
      em = emo;
      void emsqo;
    }

    if (rec.irez === 1) {
      // Synchronous resonance terms.
      const g200 = 1 + emsq * (-2.5 + 0.8125 * emsq);
      const g310 = 1 + 2 * emsq;
      const g300 = 1 + emsq * (-6 + 6.60937 * emsq);
      const f220 = 0.75 * (1 + cosim) * (1 + cosim);
      const f311 = 0.9375 * sinim * sinim * (1 + 3 * cosim) - 0.75 * (1 + cosim);
      let f330 = 1 + cosim;
      f330 = 1.875 * f330 * f330 * f330;
      rec.del1 = 3 * nm * nm * aonv * aonv;
      rec.del2 = 2 * rec.del1 * f220 * g200 * q22;
      rec.del3 = 3 * rec.del1 * f330 * g300 * q33 * aonv;
      rec.del1 = rec.del1 * f311 * g310 * q31 * aonv;
      rec.xlamo = (mo + nodeo + argpo - theta) % TWO_PI;
      rec.xfact = mdot + xpidot - rptim + rec.dmdt + rec.domdt + rec.dnodt - no;
    }

    rec.xli = rec.xlamo;
    rec.xni = no;
    rec.atime = 0;
    nm = no + dndt;
  }
  void ds;
  return { em, argpm, inclm, mm, nm, nodem };
}

/** Deep-space secular and resonance effects at time t (dspace); updates `st` in place. */
function dspace(rec: Rec, t: number, tc: number, st: Float64Array): void {
  // st: [em, argpm, inclm, mm, nodem, nm, dndt]
  const fasx2 = 0.13130908;
  const fasx4 = 2.8843198;
  const fasx6 = 0.37448087;
  const g22 = 5.7686396;
  const g32 = 0.95240898;
  const g44 = 1.8014998;
  const g52 = 1.050833;
  const g54 = 4.4108898;
  const rptim = 4.37526908801129966e-3;
  const stepp = 720.0;
  const stepn = -720.0;
  const step2 = 259200.0;

  let dndt = 0;
  const theta = (rec.gsto + tc * rptim) % TWO_PI;
  st[0] = st[0]! + rec.dedt * t;
  st[2] = st[2]! + rec.didt * t;
  st[1] = st[1]! + rec.domdt * t;
  st[4] = st[4]! + rec.dnodt * t;
  st[3] = st[3]! + rec.dmdt * t;

  if (rec.irez !== 0) {
    if (rec.atime === 0 || t * rec.atime <= 0 || Math.abs(t) < Math.abs(rec.atime)) {
      rec.atime = 0;
      rec.xni = rec.no;
      rec.xli = rec.xlamo;
    }
    const delt = t > 0 ? stepp : stepn;
    let iretn = 381;
    let xndt = 0;
    let xldot = 0;
    let xnddt = 0;
    let ft = 0;
    while (iretn === 381) {
      if (rec.irez !== 2) {
        xndt =
          rec.del1 * Math.sin(rec.xli - fasx2) +
          rec.del2 * Math.sin(2 * (rec.xli - fasx4)) +
          rec.del3 * Math.sin(3 * (rec.xli - fasx6));
        xldot = rec.xni + rec.xfact;
        xnddt =
          rec.del1 * Math.cos(rec.xli - fasx2) +
          2 * rec.del2 * Math.cos(2 * (rec.xli - fasx4)) +
          3 * rec.del3 * Math.cos(3 * (rec.xli - fasx6));
        xnddt *= xldot;
      } else {
        const xomi = rec.argpo + rec.argpdot * rec.atime;
        const x2omi = xomi + xomi;
        const x2li = rec.xli + rec.xli;
        xndt =
          rec.d2201 * Math.sin(x2omi + rec.xli - g22) +
          rec.d2211 * Math.sin(rec.xli - g22) +
          rec.d3210 * Math.sin(xomi + rec.xli - g32) +
          rec.d3222 * Math.sin(-xomi + rec.xli - g32) +
          rec.d4410 * Math.sin(x2omi + x2li - g44) +
          rec.d4422 * Math.sin(x2li - g44) +
          rec.d5220 * Math.sin(xomi + rec.xli - g52) +
          rec.d5232 * Math.sin(-xomi + rec.xli - g52) +
          rec.d5421 * Math.sin(xomi + x2li - g54) +
          rec.d5433 * Math.sin(-xomi + x2li - g54);
        xldot = rec.xni + rec.xfact;
        xnddt =
          rec.d2201 * Math.cos(x2omi + rec.xli - g22) +
          rec.d2211 * Math.cos(rec.xli - g22) +
          rec.d3210 * Math.cos(xomi + rec.xli - g32) +
          rec.d3222 * Math.cos(-xomi + rec.xli - g32) +
          rec.d5220 * Math.cos(xomi + rec.xli - g52) +
          rec.d5232 * Math.cos(-xomi + rec.xli - g52) +
          2 *
            (rec.d4410 * Math.cos(x2omi + x2li - g44) +
              rec.d4422 * Math.cos(x2li - g44) +
              rec.d5421 * Math.cos(xomi + x2li - g54) +
              rec.d5433 * Math.cos(-xomi + x2li - g54));
        xnddt *= xldot;
      }
      if (Math.abs(t - rec.atime) >= stepp) {
        iretn = 381;
      } else {
        ft = t - rec.atime;
        iretn = 0;
      }
      if (iretn === 381) {
        rec.xli = rec.xli + xldot * delt + xndt * step2;
        rec.xni = rec.xni + xndt * delt + xnddt * step2;
        rec.atime += delt;
      }
    }
    st[5] = rec.xni + xndt * ft + xnddt * ft * ft * 0.5;
    const xl = rec.xli + xldot * ft + xndt * ft * ft * 0.5;
    if (rec.irez !== 1) {
      st[3] = xl - 2 * st[4]! + 2 * theta;
      dndt = st[5]! - rec.no;
    } else {
      st[3] = xl - st[4]! - st[1]! + theta;
      dndt = st[5]! - rec.no;
    }
    st[5] = rec.no + dndt;
  }
  st[6] = dndt;
}

/**
 * Initialises a satellite record from mean elements (sgp4init; "improved" mode unless `opsmode` is "a"). The record's `error` is non-zero
 * when the elements are unusable (as in the reference: 1 e out of range, 2 mean motion below zero, 3 perturbed e out of range,
 * 4 semi-latus rectum below zero, 6 decayed).
 */
export function initialize(el: MeanElements, opsmode: "a" | "i" = "i"): Satrec {
  const rec = {
    error: 0,
    afspc: opsmode === "a",
    isimp: 0,
    method: "n",
    bstar: el.bstar,
    ecco: el.ecco,
    argpo: el.argpo,
    inclo: el.inclo,
    mo: el.mo,
    no: el.noKozai,
    nodeo: el.nodeo,
    epochDays1950: el.epochDays1950,
  } as unknown as Rec;
  for (const k of [
    "aycof con41 cc1 cc4 cc5 d2 d3 d4 delmo eta argpdot omgcof sinmao t2cof t3cof t4cof t5cof x1mth2 x7thm1 mdot",
    "nodedot xlcof xmcof nodecf irez d2201 d2211 d3210 d3222 d4410 d4422 d5220 d5232 d5421 d5433 dedt del1 del2",
    "del3 didt dmdt dnodt domdt e3 ee2 peo pgho pho pinco plo se2 se3 sgh2 sgh3 sgh4 sh2 sh3 si2 si3 sl2 sl3 sl4",
    "gsto xfact xgh2 xgh3 xgh4 xh2 xh3 xi2 xi3 xl2 xl3 xl4 xlamo zmol zmos atime xli xni",
  ]
    .join(" ")
    .split(" ")) {
    (rec as unknown as Record<string, number>)[k] = 0;
  }

  const ss = 78 / RE + 1;
  const qzms2t = Math.pow((120 - 78) / RE, 4);
  const temp4 = 1.5e-12;

  // initl
  const eccsq = rec.ecco * rec.ecco;
  const omeosq = 1 - eccsq;
  const rteosq = Math.sqrt(omeosq);
  const cosio = Math.cos(rec.inclo);
  const cosio2 = cosio * cosio;
  const ak = Math.pow(XKE / rec.no, X2O3);
  const d1 = (0.75 * J2 * (3 * cosio2 - 1)) / (rteosq * omeosq);
  let delPrime = d1 / (ak * ak);
  const adel = ak * (1 - delPrime * delPrime - delPrime * (1 / 3 + (134 * delPrime * delPrime) / 81));
  delPrime = d1 / (adel * adel);
  rec.no = rec.no / (1 + delPrime);
  const ao = Math.pow(XKE / rec.no, X2O3);
  const sinio = Math.sin(rec.inclo);
  const po = ao * omeosq;
  const con42 = 1 - 5 * cosio2;
  rec.con41 = -con42 - cosio2 - cosio2;
  const posq = po * po;
  const rp = ao * (1 - rec.ecco);
  rec.method = "n";
  if (rec.afspc) {
    // AFSPC mode: the old 1970-based sidereal time.
    const ts70 = rec.epochDays1950 - 7305.0;
    const ds70 = Math.floor(ts70 + 1.0e-8);
    const tfrac = ts70 - ds70;
    const c1 = 1.72027916940703639e-2;
    const thgr70 = 1.7321343856509374;
    const fk5r = 5.07551419432269442e-15;
    const c1p2p = c1 + TWO_PI;
    rec.gsto = (thgr70 + c1 * ds70 + c1p2p * tfrac + ts70 * ts70 * fk5r) % TWO_PI;
    if (rec.gsto < 0) rec.gsto += TWO_PI;
  } else rec.gsto = gstime(rec.epochDays1950 + 2433281.5); // improved: IAU 1982 GMST

  if (omeosq >= 0 || rec.no >= 0) {
    rec.isimp = 0;
    if (rp < 220 / RE + 1) rec.isimp = 1;
    let sfour = ss;
    let qzms24 = qzms2t;
    const perige = (rp - 1) * RE;
    if (perige < 156) {
      sfour = perige - 78;
      if (perige < 98) sfour = 20;
      qzms24 = Math.pow((120 - sfour) / RE, 4);
      sfour = sfour / RE + 1;
    }
    const pinvsq = 1 / posq;
    const tsi = 1 / (ao - sfour);
    rec.eta = ao * rec.ecco * tsi;
    const etasq = rec.eta * rec.eta;
    const eeta = rec.ecco * rec.eta;
    const psisq = Math.abs(1 - etasq);
    const coef = qzms24 * Math.pow(tsi, 4);
    const coef1 = coef / Math.pow(psisq, 3.5);
    const cc2 =
      coef1 *
      rec.no *
      (ao * (1 + 1.5 * etasq + eeta * (4 + etasq)) +
        ((0.375 * J2 * tsi) / psisq) * rec.con41 * (8 + 3 * etasq * (8 + etasq)));
    rec.cc1 = rec.bstar * cc2;
    let cc3 = 0;
    if (rec.ecco > 1e-4) cc3 = (-2 * coef * tsi * J3OJ2 * rec.no * sinio) / rec.ecco;
    rec.x1mth2 = 1 - cosio2;
    rec.cc4 =
      2 *
      rec.no *
      coef1 *
      ao *
      omeosq *
      (rec.eta * (2 + 0.5 * etasq) +
        rec.ecco * (0.5 + 2 * etasq) -
        ((J2 * tsi) / (ao * psisq)) *
          (-3 * rec.con41 * (1 - 2 * eeta + etasq * (1.5 - 0.5 * eeta)) +
            0.75 * rec.x1mth2 * (2 * etasq - eeta * (1 + etasq)) * Math.cos(2 * rec.argpo)));
    rec.cc5 = 2 * coef1 * ao * omeosq * (1 + 2.75 * (etasq + eeta) + eeta * etasq);
    const cosio4 = cosio2 * cosio2;
    const temp1 = 1.5 * J2 * pinvsq * rec.no;
    const temp2 = 0.5 * temp1 * J2 * pinvsq;
    const temp3 = -0.46875 * J4 * pinvsq * pinvsq * rec.no;
    rec.mdot = rec.no + 0.5 * temp1 * rteosq * rec.con41 + 0.0625 * temp2 * rteosq * (13 - 78 * cosio2 + 137 * cosio4);
    rec.argpdot =
      -0.5 * temp1 * con42 +
      0.0625 * temp2 * (7 - 114 * cosio2 + 395 * cosio4) +
      temp3 * (3 - 36 * cosio2 + 49 * cosio4);
    const xhdot1 = -temp1 * cosio;
    rec.nodedot = xhdot1 + (0.5 * temp2 * (4 - 19 * cosio2) + 2 * temp3 * (3 - 7 * cosio2)) * cosio;
    const xpidot = rec.argpdot + rec.nodedot;
    rec.omgcof = rec.bstar * cc3 * Math.cos(rec.argpo);
    rec.xmcof = 0;
    if (rec.ecco > 1e-4) rec.xmcof = (-X2O3 * coef * rec.bstar) / eeta;
    rec.nodecf = 3.5 * omeosq * xhdot1 * rec.cc1;
    rec.t2cof = 1.5 * rec.cc1;
    if (Math.abs(cosio + 1) > 1.5e-12) rec.xlcof = (-0.25 * J3OJ2 * sinio * (3 + 5 * cosio)) / (1 + cosio);
    else rec.xlcof = (-0.25 * J3OJ2 * sinio * (3 + 5 * cosio)) / temp4;
    rec.aycof = -0.5 * J3OJ2 * sinio;
    const delmotemp = 1 + rec.eta * Math.cos(rec.mo);
    rec.delmo = delmotemp * delmotemp * delmotemp;
    rec.sinmao = Math.sin(rec.mo);
    rec.x7thm1 = 7 * cosio2 - 1;

    // Deep space.
    if (TWO_PI / rec.no >= 225) {
      rec.method = "d";
      rec.isimp = 1;
      const tc = 0;
      const inclm = rec.inclo;
      const ds = dscom(rec.epochDays1950, rec.ecco, rec.argpo, tc, rec.inclo, rec.nodeo, rec.no);
      Object.assign(rec, {
        e3: ds.e3,
        ee2: ds.ee2,
        peo: ds.peo,
        pgho: ds.pgho,
        pho: ds.pho,
        pinco: ds.pinco,
        plo: ds.plo,
        se2: ds.se2,
        se3: ds.se3,
        sgh2: ds.sgh2,
        sgh3: ds.sgh3,
        sgh4: ds.sgh4,
        sh2: ds.sh2,
        sh3: ds.sh3,
        si2: ds.si2,
        si3: ds.si3,
        sl2: ds.sl2,
        sl3: ds.sl3,
        sl4: ds.sl4,
        xgh2: ds.xgh2,
        xgh3: ds.xgh3,
        xgh4: ds.xgh4,
        xh2: ds.xh2,
        xh3: ds.xh3,
        xi2: ds.xi2,
        xi3: ds.xi3,
        xl2: ds.xl2,
        xl3: ds.xl3,
        xl4: ds.xl4,
        zmol: ds.zmol,
        zmos: ds.zmos,
      });
      const pel = Float64Array.from([rec.ecco, rec.inclo, rec.nodeo, rec.argpo, rec.mo]);
      dpper(rec, 0, true, pel);
      dsinit(
        rec,
        ds,
        ds.cosim,
        ds.emsq,
        rec.argpo,
        ds.s1,
        ds.s2,
        ds.s3,
        ds.s4,
        ds.s5,
        ds.sinim,
        ds.ss1,
        ds.ss2,
        ds.ss3,
        ds.ss4,
        ds.ss5,
        ds.sz1,
        ds.sz3,
        ds.sz11,
        ds.sz13,
        ds.sz21,
        ds.sz23,
        ds.sz31,
        ds.sz33,
        0,
        tc,
        rec.gsto,
        rec.mo,
        rec.mdot,
        rec.no,
        rec.nodeo,
        rec.nodedot,
        xpidot,
        ds.z1,
        ds.z3,
        ds.z11,
        ds.z13,
        ds.z21,
        ds.z23,
        ds.z31,
        ds.z33,
        rec.ecco,
        eccsq,
        ds.em,
        0,
        inclm,
        0,
        ds.nm,
        0,
      );
    }

    if (rec.isimp !== 1) {
      const cc1sq = rec.cc1 * rec.cc1;
      rec.d2 = 4 * ao * tsi * cc1sq;
      const temp = (rec.d2 * tsi * rec.cc1) / 3;
      rec.d3 = (17 * ao + sfour) * temp;
      rec.d4 = 0.5 * temp * ao * tsi * (221 * ao + 31 * sfour) * rec.cc1;
      rec.t3cof = rec.d2 + 2 * cc1sq;
      rec.t4cof = 0.25 * (3 * rec.d3 + rec.cc1 * (12 * rec.d2 + 10 * cc1sq));
      rec.t5cof = 0.2 * (3 * rec.d4 + 12 * rec.cc1 * rec.d3 + 6 * rec.d2 * rec.d2 + 15 * cc1sq * (2 * rec.d2 + cc1sq));
    }
  }

  const out = new Float64Array(6);
  propagateRec(rec, 0, out);
  return wrap(rec);
}

const RECS = new WeakMap<Satrec, Rec>();
function wrap(rec: Rec): Satrec {
  const s: Satrec = {
    get error() {
      return rec.error;
    },
    method: rec.method,
    epochDays1950: rec.epochDays1950,
  };
  RECS.set(s, rec);
  return s;
}

const pel = new Float64Array(5);
const dst = new Float64Array(7);

/**
 * TEME position (km) and velocity (km/s) at `tsince` minutes from the element epoch into out[o..o+5]. Returns the
 * error code (0 ok; 1 eccentricity out of range, 2 mean motion below zero, 3 perturbed eccentricity out of range,
 * 4 semi-latus rectum below zero, 6 decayed); on an error out is left as it was.
 */
export function propagate(sat: Satrec, tsince: number, out: Float64Array, o = 0): number {
  const rec = RECS.get(sat);
  if (!rec) throw new TypeError("not a record from initialize()");
  return propagateRec(rec, tsince, out, o);
}

function propagateRec(rec: Rec, tsince: number, out: Float64Array, o = 0): number {
  const temp4 = 1.5e-12;
  const vkmpersec = VKMPERSEC;
  rec.error = 0;

  const xmdf = rec.mo + rec.mdot * tsince;
  const argpdf = rec.argpo + rec.argpdot * tsince;
  const nodedf = rec.nodeo + rec.nodedot * tsince;
  let argpm = argpdf;
  let mm = xmdf;
  const t2 = tsince * tsince;
  let nodem = nodedf + rec.nodecf * t2;
  let tempa = 1 - rec.cc1 * tsince;
  let tempe = rec.bstar * rec.cc4 * tsince;
  let templ = rec.t2cof * t2;

  if (rec.isimp !== 1) {
    const delomg = rec.omgcof * tsince;
    const delmtemp = 1 + rec.eta * Math.cos(xmdf);
    const delm = rec.xmcof * (delmtemp * delmtemp * delmtemp - rec.delmo);
    const temp = delomg + delm;
    mm = xmdf + temp;
    argpm = argpdf - temp;
    const t3 = t2 * tsince;
    const t4 = t3 * tsince;
    tempa = tempa - rec.d2 * t2 - rec.d3 * t3 - rec.d4 * t4;
    tempe = tempe + rec.bstar * rec.cc5 * (Math.sin(mm) - rec.sinmao);
    templ = templ + rec.t3cof * t3 + t4 * (rec.t4cof + tsince * rec.t5cof);
  }

  let nm = rec.no;
  let em = rec.ecco;
  let inclm = rec.inclo;
  if (rec.method === "d") {
    const tc = tsince;
    dst[0] = em;
    dst[1] = argpm;
    dst[2] = inclm;
    dst[3] = mm;
    dst[4] = nodem;
    dst[5] = nm;
    dspace(rec, tsince, tc, dst);
    em = dst[0]!;
    argpm = dst[1]!;
    inclm = dst[2]!;
    mm = dst[3]!;
    nodem = dst[4]!;
    nm = dst[5]!;
  }

  if (nm <= 0) {
    rec.error = 2;
    return 2;
  }
  const am = Math.pow(XKE / nm, X2O3) * tempa * tempa;
  nm = XKE / Math.pow(am, 1.5);
  em -= tempe;

  if (em >= 1 || em < -0.001) {
    rec.error = 1;
    return 1;
  }
  if (em < 1e-6) em = 1e-6;
  mm += rec.no * templ;
  let xlm = mm + argpm + nodem;
  nodem %= TWO_PI;
  argpm %= TWO_PI;
  xlm %= TWO_PI;
  mm = (xlm - argpm - nodem) % TWO_PI;

  const sinim = Math.sin(inclm);
  const cosim = Math.cos(inclm);

  // Lunar-solar periodics.
  let ep = em;
  let xincp = inclm;
  let argpp = argpm;
  let nodep = nodem;
  let mp = mm;
  let sinip = sinim;
  let cosip = cosim;
  if (rec.method === "d") {
    pel[0] = ep;
    pel[1] = xincp;
    pel[2] = nodep;
    pel[3] = argpp;
    pel[4] = mp;
    dpper(rec, tsince, false, pel);
    ep = pel[0]!;
    xincp = pel[1]!;
    nodep = pel[2]!;
    argpp = pel[3]!;
    mp = pel[4]!;
    if (xincp < 0) {
      xincp = -xincp;
      nodep += Math.PI;
      argpp -= Math.PI;
    }
    if (ep < 0 || ep > 1) {
      rec.error = 3;
      return 3;
    }
  }

  // Long-period periodics.
  if (rec.method === "d") {
    sinip = Math.sin(xincp);
    cosip = Math.cos(xincp);
    rec.aycof = -0.5 * J3OJ2 * sinip;
    if (Math.abs(cosip + 1) > 1.5e-12) rec.xlcof = (-0.25 * J3OJ2 * sinip * (3 + 5 * cosip)) / (1 + cosip);
    else rec.xlcof = (-0.25 * J3OJ2 * sinip * (3 + 5 * cosip)) / temp4;
  }
  const axnl = ep * Math.cos(argpp);
  let temp = 1 / (am * (1 - ep * ep));
  const aynl = ep * Math.sin(argpp) + temp * rec.aycof;
  const xl = mp + argpp + nodep + temp * rec.xlcof * axnl;

  // Kepler's equation.
  const u = (xl - nodep) % TWO_PI;
  let eo1 = u;
  let tem5 = 9999.9;
  let ktr = 1;
  let sineo1 = 0;
  let coseo1 = 0;
  while (Math.abs(tem5) >= 1e-12 && ktr <= 10) {
    sineo1 = Math.sin(eo1);
    coseo1 = Math.cos(eo1);
    tem5 = 1 - coseo1 * axnl - sineo1 * aynl;
    tem5 = (u - aynl * coseo1 + axnl * sineo1 - eo1) / tem5;
    if (Math.abs(tem5) >= 0.95) tem5 = tem5 > 0 ? 0.95 : -0.95;
    eo1 += tem5;
    ktr++;
  }

  // Short-period periodics.
  const ecose = axnl * coseo1 + aynl * sineo1;
  const esine = axnl * sineo1 - aynl * coseo1;
  const el2 = axnl * axnl + aynl * aynl;
  const pl = am * (1 - el2);
  if (pl < 0) {
    rec.error = 4;
    return 4;
  }
  const rl = am * (1 - ecose);
  const rdotl = (Math.sqrt(am) * esine) / rl;
  const rvdotl = Math.sqrt(pl) / rl;
  const betal = Math.sqrt(1 - el2);
  temp = esine / (1 + betal);
  const sinu = (am / rl) * (sineo1 - aynl - axnl * temp);
  const cosu = (am / rl) * (coseo1 - axnl + aynl * temp);
  let su = Math.atan2(sinu, cosu);
  const sin2u = (cosu + cosu) * sinu;
  const cos2u = 1 - 2 * sinu * sinu;
  temp = 1 / pl;
  const temp1 = 0.5 * J2 * temp;
  const temp2 = temp1 * temp;

  let con41 = rec.con41;
  let x1mth2 = rec.x1mth2;
  let x7thm1 = rec.x7thm1;
  if (rec.method === "d") {
    const cosisq = cosip * cosip;
    con41 = 3 * cosisq - 1;
    x1mth2 = 1 - cosisq;
    x7thm1 = 7 * cosisq - 1;
  }
  const mrt = rl * (1 - 1.5 * temp2 * betal * con41) + 0.5 * temp1 * x1mth2 * cos2u;
  su -= 0.25 * temp2 * x7thm1 * sin2u;
  const xnode = nodep + 1.5 * temp2 * cosip * sin2u;
  const xinc = xincp + 1.5 * temp2 * cosip * sinip * cos2u;
  const mvt = rdotl - (nm * temp1 * x1mth2 * sin2u) / XKE;
  const rvdot = rvdotl + (nm * temp1 * (x1mth2 * cos2u + 1.5 * con41)) / XKE;

  // Orientation vectors.
  const sinsu = Math.sin(su);
  const cossu = Math.cos(su);
  const snod = Math.sin(xnode);
  const cnod = Math.cos(xnode);
  const sini = Math.sin(xinc);
  const cosi = Math.cos(xinc);
  const xmx = -snod * cosi;
  const xmy = cnod * cosi;
  const ux = xmx * sinsu + cnod * cossu;
  const uy = xmy * sinsu + snod * cossu;
  const uz = sini * sinsu;
  const vx = xmx * cossu - cnod * sinsu;
  const vy = xmy * cossu - snod * sinsu;
  const vz = sini * cossu;

  if (mrt < 1) {
    rec.error = 6; // decayed
    return 6;
  }
  out[o] = mrt * ux * RE;
  out[o + 1] = mrt * uy * RE;
  out[o + 2] = mrt * uz * RE;
  out[o + 3] = (mvt * ux + rvdot * vx) * vkmpersec;
  out[o + 4] = (mvt * uy + rvdot * vy) * vkmpersec;
  out[o + 5] = (mvt * uz + rvdot * vz) * vkmpersec;
  return 0;
}

export const MINUTES_PER_DAY = 1440;
/** Minutes per canonical time unit (the reference's tumin). */
export { TUMIN };

/** Julian date (UTC) of a calendar instant; for element epochs only (no leap-second detail is needed). */
function jday(year: number, month: number, day: number, hour: number, minute: number, sec: number): number {
  return (
    367 * year -
    Math.floor((7 * (year + Math.floor((month + 9) / 12))) / 4) +
    Math.floor((275 * month) / 9) +
    day +
    1721013.5 +
    ((sec / 60 + minute) / 60 + hour) / 24
  );
}

/** Mean elements from the two lines of a TLE (the reference's twoline2rv field layout). */
export function fromTle(line1: string, line2: string): MeanElements & { catalogNumber: number } {
  const num = (s: string): number => Number(s.trim());
  // Assumed-decimal exponent fields such as " 28098-4" -> 0.28098e-4.
  const expField = (s: string): number => {
    const t = s.trim();
    if (t === "" || /^[+-]?0+[+-]?0*$/.test(t)) return 0;
    const m = /^([+-]?)(\d+)([+-]\d+)$/.exec(t.replace(/\s+/g, ""));
    if (!m) throw new RangeError(`bad exponent field "${s}"`);
    return Number(`${m[1]}0.${m[2]}e${m[3]}`);
  };
  const yy = num(line1.slice(18, 20));
  const days = num(line1.slice(20, 32));
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  const jd = jday(year, 1, 0, 0, 0, 0) + days;
  return {
    catalogNumber: num(line1.slice(2, 7)),
    epochDays1950: jd - 2433281.5,
    bstar: expField(line1.slice(53, 61)),
    inclo: num(line2.slice(8, 16)) * DEG,
    nodeo: num(line2.slice(17, 25)) * DEG,
    ecco: Number(`0.${line2.slice(26, 33).trim()}`),
    argpo: num(line2.slice(34, 42)) * DEG,
    mo: num(line2.slice(43, 51)) * DEG,
    noKozai: num(line2.slice(52, 63)) / (MINUTES_PER_DAY / TWO_PI),
  };
}

/** OMM keywords SGP4 needs (CCSDS 502.0-B-3; CelesTrak's FORMAT=JSON). */
export interface Omm {
  EPOCH: string;
  MEAN_MOTION: number;
  ECCENTRICITY: number;
  INCLINATION: number;
  RA_OF_ASC_NODE: number;
  ARG_OF_PERICENTER: number;
  MEAN_ANOMALY: number;
  BSTAR: number;
}

/** Mean elements from an OMM record: EPOCH an ISO UTC time, angles in degrees, mean motion in rev/day. */
export function fromOmm(o: Omm): MeanElements {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)Z?$/.exec(o.EPOCH);
  if (!m) throw new RangeError(`bad OMM EPOCH "${o.EPOCH}"`);
  const jd = jday(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
  return {
    epochDays1950: jd - 2433281.5,
    bstar: o.BSTAR,
    inclo: o.INCLINATION * DEG,
    nodeo: o.RA_OF_ASC_NODE * DEG,
    ecco: o.ECCENTRICITY,
    argpo: o.ARG_OF_PERICENTER * DEG,
    mo: o.MEAN_ANOMALY * DEG,
    noKozai: o.MEAN_MOTION / (MINUTES_PER_DAY / TWO_PI),
  };
}
