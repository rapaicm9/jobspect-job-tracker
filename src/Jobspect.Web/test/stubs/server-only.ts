// Stands in for the `server-only` package, which exists to throw when a module
// is pulled into a client bundle. Under Vitest that guard has nothing to
// protect: the modules are being loaded in Node on purpose. The real guard is
// still enforced two other ways - the lint rule requiring the import, and the
// bundler resolving the real package during `next build`.
export {};
