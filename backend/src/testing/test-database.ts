export function getTestDatabaseUrl(): string {
  const testUrl = process.env.TEST_DATABASE_URL;

  if (!testUrl || !decodeURIComponent(new URL(testUrl).pathname).endsWith("_test")) {
    throw new Error("TEST_DATABASE_URL must name a separate database ending in _test");
  }
  if (
    process.env.DATABASE_URL &&
    new URL(testUrl).pathname === new URL(process.env.DATABASE_URL).pathname
  ) {
    throw new Error("The test database must differ from DATABASE_URL");
  }

  return testUrl;
}
