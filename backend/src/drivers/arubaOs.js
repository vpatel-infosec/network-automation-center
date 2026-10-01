import { prepareCliSession, defaultIdentify, cliBackup, cliRunCommands, pushConfigViaCli } from './base.js';

/**
 * Aruba switches (ArubaOS-Switch / ProCurve) and ArubaOS-CX.
 * Controllers (ArubaOS 8 mobility controllers) share the same CLI verbs.
 */
const arubaOs = {
  id: 'aruba_os',
  label: 'Aruba OS — switch, controller, AP gateway',
  protocol: 'ssh',
  vendors: ['aruba'],
  deviceTypes: ['switch', 'router', 'access_point', 'wlc', 'other'],
  prompt: /[>#]\s*$/,
  requiresEnable: true,
  supportsBackup: true,
  supportsPush: true,
  commands: {
    identify: ['show version'],
    disablePaging: ['no page'],
    backup: ['show running-config'],
    enterConfig: ['configure terminal'],
    exitConfig: ['end'],
    save: ['write memory'],
  },
  prepare(conn, { device, credential }) {
    return prepareCliSession(conn, device, arubaOs, credential);
  },
  identify(conn, { device }) {
    return defaultIdentify(conn, device, arubaOs);
  },
  backup(conn, { device }) {
    return cliBackup(conn, device, arubaOs);
  },
  runCommands(conn, { device }, commands) {
    return cliRunCommands(conn, device, arubaOs, commands);
  },
  pushConfig(conn, { device }, content, options) {
    return pushConfigViaCli(conn, device, arubaOs, content, options);
  },
};

export default arubaOs;
