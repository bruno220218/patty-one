/** Turns a database error into a message people can act on. */
export function dbError(error: { message: string; code?: string } | null | undefined): Error {
  if (!error) return new Error("Algo deu errado. Tente novamente.");
  if (error.code === "42501") return new Error("Você não tem permissão para esta ação.");
  if (error.code === "23514") return new Error("Preencha os campos obrigatórios.");
  if (error.code === "PGRST116") return new Error("Registro não encontrado.");
  return new Error(error.message || "Algo deu errado. Tente novamente.");
}

export function unwrap<T>(result: {
  data: T;
  error: { message: string; code?: string } | null;
}): NonNullable<T> {
  if (result.error) throw dbError(result.error);
  if (result.data === null || result.data === undefined) {
    throw new Error("Registro não encontrado.");
  }
  return result.data as NonNullable<T>;
}
