import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCdpNeighbors, parseLldpNeighbors, buildTopologyGraph } from '../src/services/topologyService.js';

test('parseCdpNeighbors extracts switch-to-switch links from Cisco CDP output', () => {
  const output = `
SW1# show cdp neighbors detail
Device ID: SW2
Entry address(es):
  IP address: 10.0.0.2
Platform: cisco WS-C2960X, Capabilities: Switch
Interface: GigabitEthernet1/0/1, Port ID (outgoing port): GigabitEthernet1/0/2
Holdtime : 129 sec

Device ID: AP1
Interface: GigabitEthernet2/0/1, Port ID (outgoing port): GigabitEthernet0/1
  
  `;

  const neighbors = parseCdpNeighbors(output, 'SW1');
  assert.deepEqual(neighbors, [
    {
      device: 'SW1',
      remoteDevice: 'SW2',
      localInterface: 'GigabitEthernet1/0/1',
      remoteInterface: 'GigabitEthernet1/0/2',
      protocol: 'cdp',
    },
    {
      device: 'SW1',
      remoteDevice: 'AP1',
      localInterface: 'GigabitEthernet2/0/1',
      remoteInterface: 'GigabitEthernet0/1',
      protocol: 'cdp',
    },
  ]);
});

test('parseLldpNeighbors extracts links from LLDP output and ignores non-neighbor noise', () => {
  const output = `
SW1# show lldp neighbors detail
------------------------------------------------
Local Intf: Gi1/0/1
Chassis id: 00aa.bbcc.0001
Port id: Gi1/0/2
Port Description: uplink to SW2
System Name: SW2
------------------------------------------------
Local Intf: Gi2/0/5
Chassis id: 0011.2233.4455
Port id: Gi0/1
System Name: AP1
`; 

  const neighbors = parseLldpNeighbors(output, 'SW1');
  assert.deepEqual(neighbors, [
    {
      device: 'SW1',
      remoteDevice: 'SW2',
      localInterface: 'Gi1/0/1',
      remoteInterface: 'Gi1/0/2',
      protocol: 'lldp',
    },
    {
      device: 'SW1',
      remoteDevice: 'AP1',
      localInterface: 'Gi2/0/5',
      remoteInterface: 'Gi0/1',
      protocol: 'lldp',
    },
  ]);
});

test('buildTopologyGraph merges CDP and LLDP neighbors into a single link when both are present', () => {
  const devices = [
    { _id: '1', name: 'SW1', host: '10.0.0.1', vendor: 'cisco', deviceType: 'switch' },
    { _id: '2', name: 'SW2', host: '10.0.0.2', vendor: 'cisco', deviceType: 'switch' },
  ];

  const graph = buildTopologyGraph(devices, [
    { device: 'SW1', remoteDevice: 'SW2', localInterface: 'Gi1/0/1', remoteInterface: 'Gi1/0/2', protocol: 'cdp' },
    { device: 'SW1', remoteDevice: 'SW2', localInterface: 'Gi1/0/1', remoteInterface: 'Gi1/0/2', protocol: 'lldp' },
  ]);

  assert.equal(graph.links.length, 1);
  assert.deepEqual(graph.links[0].protocols.sort(), ['cdp', 'lldp']);
  assert.equal(graph.links[0].sourceDevice, 'SW1');
  assert.equal(graph.links[0].targetDevice, 'SW2');
  assert.equal(graph.nodes.length, 2);
});
