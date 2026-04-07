/** https://tc39.es/ecma262/#eqn-truncate */
export function truncateDiv(x: bigint, y: bigint): bigint {
  // https://tc39.es/ecma262/#sec-numeric-types-bigint-divide
  return x / y;
}

/** https://tc39.es/ecma262/#eqn-floor */
export function floorDiv(x: bigint, y: bigint): bigint {
  // floor(x) = x - (x modulo 1).
  return (x - remainder(x, y)) / y;
}

/** https://tc39.es/ecma262/#eqn-abs */
export function abs(x: number): number
export function abs(x: bigint): bigint
export function abs(x: bigint | number): bigint | number
export function abs(x: bigint | number): bigint | number {
  if (x < 0) {
    return -x;
  }
  return x;
}

/** https://tc39.es/ecma262/#clamping */
export function clamp(lower: bigint, x: bigint, upper: bigint): bigint
export function clamp(lower: number, x: number, upper: number): number
export function clamp(lower: number | bigint, x: number | bigint, upper: number | bigint): number | bigint {
  if (x < lower) return lower;
  if (x > upper) return upper;
  return x;
}

/** https://tc39.es/ecma262/#eqn-min */
export function min(x: bigint, y: bigint): bigint {
  return x < y ? x : y;
}

/** https://tc39.es/ecma262/#eqn-max */
export function max(x: bigint, y: bigint): bigint {
  return x > y ? x : y;
}

/** https://tc39.es/ecma262/#eqn-modulo */
export function modulo(x: bigint, y: bigint): bigint
export function modulo(x: number, y: number): number
export function modulo(x: number | bigint, y: number | bigint): number | bigint {
  // (x % y + y) % y
  return (((x as bigint) % (y as bigint)) + (y as bigint)) % (y as bigint);
}

/** https://tc39.es/ecma262/#eqn-remainder */
export function remainder(x: bigint, y: bigint): bigint
export function remainder(x: number, y: number): number
export function remainder(x: number | bigint, y: number | bigint): number | bigint {
  if (typeof x === 'bigint' && typeof y === 'bigint') {
    return (x > 0 ? 1n : -1n) * abs(modulo(x, y));
  } else {
    return Math.sign(x as number) * Math.abs(modulo(x as number, y as number));
  }
}
