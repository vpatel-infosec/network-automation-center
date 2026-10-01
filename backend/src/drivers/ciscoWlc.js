import { prepareCliSession, defaultIdentify, cliBackup, cliRunCommands, pushConfigViaCli } from './base.js';

/**
 * AireOS wireless LAN controller (5508 / 5520 / 8510 / 8540 ...).
 * The running configuration is exported as replayable `config ...` commands
 * with `show run-config commands`, which also makes restore round-trips work.
 */
const ciscoWlc = {
  id: 'cisco_wlc',
  label: 'Cisco WLC (AireOS) — wireless LAN controller',
  protocol: 'ssh',
  vendors: ['cisco'],
  deviceTypes: ['wlc', 'other'],
  prompt: /[>#]\s*$/,
  requiresEnable: false,
  supportsBackup: true,
  supportsPush: true,
  commands: {
    identify: ['show sysinfo'],
    disablePaging: ['config paging disable'],
    backup: ['show run-config commands'],
    enterConfig: ['config'],
    exitConfig: ['end'],
    save: ['save config'],
  },
  adjustRestoreLines(lines) {
    const commands = lines.filter((line) => /^config\s+/i.test(line));
    return commands.length ? commands : lines;
  },
  prepare(conn, { device, credential }) {
    return prepareCliSession(conn, device, ciscoWlc, credential);
  },
  identify(conn, { device }) {
    return defaultIdentify(conn, device, ciscoWlc);
  },
  backup(conn, { device }) {
    return cliBackup(conn, device, ciscoWlc);
  },
  runCommands(conn, { device }, commands) {
    return cliRunCommands(conn, device, ciscoWlc, commands);
  },
  pushConfig(conn, { device }, content, options) {
    return pushConfigViaCli(conn, device, ciscoWlc, content, options);
  },
};

export default ciscoWlc;
