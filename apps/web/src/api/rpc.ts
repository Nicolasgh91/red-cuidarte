// Hono RPC pide `json`, `query` y `param` juntos en cada llamada, porque en la API el helper
// `validate()` se tipa con la unión de targets (ver informe de F5). `call` conserva el chequeo de
// lo que sí se manda (Partial) y completa el resto del tipo.
type Input<F> = F extends (args: infer A, ...rest: never[]) => unknown ? A : never;

export function call<F extends (args: never, ...rest: never[]) => unknown>(
  fn: F,
  input: Partial<Input<F>>,
): ReturnType<F> {
  return (fn as unknown as (a: unknown) => unknown)(input) as ReturnType<F>;
}
