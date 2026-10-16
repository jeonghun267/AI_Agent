// Development and tests: prints each message, one-time link included, to the
// server log instead of sending it. config.mjs refuses it in production,
// because anyone who can read the log could open the links.
export function createConsoleProvider({logger = console} = {}) {
  return {
    name: 'console',
    enabled: true,
    async send({to, subject, text}) {
      logger.log(`\n[mail] To: ${to}\n[mail] Subject: ${subject}\n${text}\n`);
    },
  };
}
