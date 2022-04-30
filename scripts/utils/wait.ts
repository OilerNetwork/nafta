// Wait (n) ms
export function wait(n: number) {
  return new Promise((resolve) => setTimeout(resolve, n * 1000));
}
