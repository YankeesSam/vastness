// VN-EPH-001: TAI-UTC from IERS Bulletin C, as published in https://hpiers.obspm.fr/iers/bul/bulc/Leap_Second.dat
// (retrieved 2026-11-26). Each entry holds from 00:00:00 UTC on the 1st of its month until the next entry; the leap
// second itself is 23:59:60 UTC on the last day of the month before. After the last entry no further leap seconds are
// assumed; the table is known to be complete until LEAP_SECONDS_VALID_UNTIL (the file's expiry date).

export interface LeapSecondEntry {
  readonly year: number;
  readonly month: number;
  readonly taiMinusUtc: number;
}

export const LEAP_SECONDS_SOURCE = "IERS Bulletin C 72 (July 2026), Leap_Second.dat";
export const LEAP_SECONDS_VALID_UNTIL = "2027-06-28";

const e = (year: number, month: number, taiMinusUtc: number): LeapSecondEntry => ({ year, month, taiMinusUtc });

export const LEAP_SECONDS: readonly LeapSecondEntry[] = [
  e(1972, 1, 10),
  e(1972, 7, 11),
  e(1973, 1, 12),
  e(1974, 1, 13),
  e(1975, 1, 14),
  e(1976, 1, 15),
  e(1977, 1, 16),
  e(1978, 1, 17),
  e(1979, 1, 18),
  e(1980, 1, 19),
  e(1981, 7, 20),
  e(1982, 7, 21),
  e(1983, 7, 22),
  e(1985, 7, 23),
  e(1988, 1, 24),
  e(1990, 1, 25),
  e(1991, 1, 26),
  e(1992, 7, 27),
  e(1993, 7, 28),
  e(1994, 7, 29),
  e(1996, 1, 30),
  e(1997, 7, 31),
  e(1999, 1, 32),
  e(2006, 1, 33),
  e(2009, 1, 34),
  e(2012, 7, 35),
  e(2015, 7, 36),
  e(2017, 1, 37),
];
