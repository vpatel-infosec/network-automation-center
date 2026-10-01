import AppError from '../utils/AppError.js';
import { truncate } from './base.js';

const PUSH_UNSUPPORTED =
  'The RESTCONF driver performs configuration retrieval only. Select an SSH driver (for example cisco_ios) for this device to push configuration.';

/**
 * Read-only RESTCONF driver for Cisco IOS-XE platforms (Catalyst 9000,
 * C9800 WLC, ...). The native data model is stored as a JSON snapshot, giving
 * you a versioned configuration record without touching the CLI.
 */
const ciscoRestconf = {
  id: 'cisco_restconf',
  label: 'Cisco IOS-XE RESTCONF — read-only config retrieval',
  protocol: 'restconf',
  vendors: ['cisco'],
  deviceTypes: ['switch', 'router', 'wlc', 'access_point', 'other'],
  supportsBackup: true,
  supportsPush: false,
  commands: {},
  async identify(session) {
    const data = await session.request('GET', '/restconf/data/Cisco-IOS-XE-native:native/hostname');
    return truncate(typeof data === 'string' ? data : JSON.stringify(data, null, 2), 20000);
  },
  async backup(session) {
    const data = await session.request('GET', '/restconf/data/Cisco-IOS-XE-native:native');
    return truncate(typeof data === 'string' ? data : JSON.stringify(data, null, 2), 4 * 1024 * 1024);
  },
  async pushConfig() {
    throw new AppError(PUSH_UNSUPPORTED, 400);
  },
  async runCommands() {
    throw new AppError(PUSH_UNSUPPORTED, 400);
  },
};

export default ciscoRestconf;
