type PageResult<T> = {
  data: T[] | null
  error: { message: string } | null
}

/** Fetch every row from a PostgREST query in bounded pages instead of silently stopping at the server row cap. */
export async function fetchAllRows<T>(
  queryPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const pageSize = 1000
  const rows: T[] = []

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryPage(from, from + pageSize - 1)
    if (error) throw error

    const page = data ?? []
    rows.push(...page)
    if (page.length < pageSize) return rows
  }
}
