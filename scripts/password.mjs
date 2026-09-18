import { randomBytes, scryptSync } from "node:crypto";
// Read the password from standard input, never as a command-line argument.
let input = "";
for await (const chunk of process.stdin) input += chunk;
const password = input.replace(/\r?\n$/, "");
if (password.length < 14 || password.length > 256) {
  console.error("Usá entre 14 y 256 caracteres.");
  process.exit(1);
}
const salt = randomBytes(16).toString("hex");
console.log(salt + ":" + scryptSync(password, salt, 64).toString("hex"));
