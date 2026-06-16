// +--------------------------------------------------------------
// <copyright file="flags.js" company="Microsoft">
// copyright (c) Microsoft Corporation. All rights reserved.
// </copyright>
//
// @fileoverview CLI flag/argument parser.
// ---------------------------------------------------------------

const { EXIT_CODE } = require("../core/constants.js");

/**
 * Parses flags and positional arguments from a raw args array.
 *
 * @param {string[]} args - Raw argument tokens
 * @param {object} flagDefs - Map of flag names to { short, type }
 * @returns {{ flags: object, positionalArgs: string[] }}
 */
function parseFlags(args, flagDefs = {}) {
  const flags = {};
  const positionalArgs = [];

  const longMap = {};
  const shortMap = {};
  for (const [key, def] of Object.entries(flagDefs)) {
    longMap[`--${key}`] = { key, type: def.type || "boolean" };
    if (def.short) {
      shortMap[`-${def.short}`] = { key, type: def.type || "boolean" };
    }
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const entry = longMap[arg] || shortMap[arg];

    if (entry) {
      if (entry.type === "boolean") {
        flags[entry.key] = true;
      } else {
        i++;
        if (i >= args.length) {
          console.error(`Error: Flag ${arg} requires a value.`);
          process.exit(EXIT_CODE.ERROR);
        }
        flags[entry.key] = args[i];
      }
    } else if (arg === "--") {
      positionalArgs.push(...args.slice(i + 1));
      break;
    } else if (arg.startsWith("-")) {
      console.error(`Error: Unknown flag "${arg}".`);
      process.exit(EXIT_CODE.ERROR);
    } else {
      positionalArgs.push(arg);
    }
  }

  return { flags, positionalArgs };
}

module.exports = { parseFlags };
