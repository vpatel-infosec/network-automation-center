import api from '../api/client.js';

const PAGE_SIZE = 200;

async function fetchAllItems(endpoint, params = {}) {
  const { data: first } = await api.get(endpoint, { params: { ...params, page: 1, limit: PAGE_SIZE } });
  if (!Array.isArray(first.items)) return first;
  const pages = Math.max(1, Number(first.pages) || 1);
  const items = [...first.items];
  for (let start = 2; start <= pages; start += 6) {
    const pageNumbers = Array.from({ length: Math.min(6, pages - start + 1) }, (_, index) => start + index);
    const results = await Promise.all(pageNumbers.map((page) =>
      api.get(endpoint, { params: { ...params, page, limit: PAGE_SIZE } })
    ));
    for (const result of results) items.push(...(result.data.items || []));
  }
  return { ...first, items };
}

const display = (value) => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(display).filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const date = (value) => value ? new Date(value).toISOString() : '';

function deviceRow(device) {
  return {
    name: device.name,
    host: device.host,
    port: device.port,
    vendor: device.vendor,
    deviceType: device.deviceType,
    platform: device.platform,
    site: device.site,
    location: device.location,
    protocol: device.protocol,
    driver: device.driver,
    reachable: device.status?.reachable,
    lastCheckedAt: date(device.status?.lastCheckedAt),
    lastBackupStatus: device.status?.lastBackupStatus,
    lastBackupAt: date(device.status?.lastBackupAt),
  };
}

function configRow(version) {
  return {
    device: version.device?.name,
    host: version.device?.host,
    version: version.version,
    trigger: version.trigger,
    sizeBytes: version.size,
    startupStatus: version.startupStatus || 'unsupported',
    startupSizeBytes: version.startupSize || 0,
    capturedAt: date(version.createdAt),
    mongoDb: 'stored',
    fileServer: (version.storage || []).find((target) => target.provider === 'file_server')?.status || 'not configured',
    cloud: (version.storage || []).find((target) => target.provider === 's3')?.status || 'not configured',
  };
}

async function reportFor(pathname) {
  if (pathname === '/backups' || pathname === '/configs') {
    const { items } = await fetchAllItems('/configs');
    return { title: 'Backups', columns: ['device', 'host', 'version', 'trigger', 'sizeBytes', 'startupStatus', 'startupSizeBytes', 'capturedAt', 'mongoDb', 'fileServer', 'cloud'], rows: items.map(configRow) };
  }

  if (pathname === '/devices') {
    const { items } = await fetchAllItems('/devices');
    return { title: 'Devices', columns: ['name', 'host', 'port', 'vendor', 'deviceType', 'platform', 'site', 'location', 'protocol', 'driver', 'reachable', 'lastCheckedAt', 'lastBackupStatus', 'lastBackupAt'], rows: items.map(deviceRow) };
  }

  if (pathname.startsWith('/devices/')) {
    const id = pathname.split('/')[2];
    if (!id || !/^[a-f0-9]{24}$/i.test(id)) throw new Error('Open a device detail page to export its report.');
    const { data } = await api.get(`/devices/${id}`);
    return { title: `Device ${data.device.name}`, columns: ['name', 'host', 'port', 'vendor', 'deviceType', 'platform', 'model', 'site', 'location', 'protocol', 'driver', 'reachable', 'lastCheckedAt', 'lastBackupStatus', 'lastBackupAt'], rows: [deviceRow(data.device)] };
  }

  if (pathname === '/monitoring') {
    const { data } = await api.get('/devices/monitoring');
    const devices = [...(data.onlineDevices || []), ...(data.offlineDevices || [])];
    return { title: 'Monitoring', columns: ['name', 'host', 'vendor', 'deviceType', 'site', 'reachable', 'latencyMs', 'lastCheckedAt', 'lastCheckMessage', 'lastBackupStatus', 'lastBackupAt'], rows: devices.map((device) => ({
      name: device.name,
      host: device.host,
      vendor: device.vendor,
      deviceType: device.deviceType,
      site: device.site,
      reachable: device.status?.reachable,
      latencyMs: device.status?.latencyMs,
      lastCheckedAt: date(device.status?.lastCheckedAt),
      lastCheckMessage: device.status?.lastCheckMessage,
      lastBackupStatus: device.status?.lastBackupStatus,
      lastBackupAt: date(device.status?.lastBackupAt),
    })) };
  }

  if (pathname === '/sites') {
    const { data } = await api.get('/sites');
    return { title: 'Sites', columns: ['name', 'code', 'region', 'address', 'description', 'active', 'createdAt'], rows: (data.items || []).map((site) => ({ ...site.toObject?.(), ...site, createdAt: date(site.createdAt) })) };
  }

  if (pathname === '/topology') {
    const { data } = await api.get('/topology/saved');
    return {
      title: 'Topology',
      columns: ['name', 'source', 'generatedAt', 'deviceCount', 'linkCount', 'protocols', 'devices'],
      rows: (data || []).map((topology) => ({
        name: topology.name,
        source: topology.source,
        generatedAt: date(topology.generatedAt),
        deviceCount: (topology.nodes || []).length,
        linkCount: (topology.links || []).length,
        protocols: topology.protocols,
        devices: (topology.nodes || []).map((node) => node.label || node.hostname || node.id),
      })),
    };
  }

  if (pathname.startsWith('/templates')) {
    const { data } = await api.get('/templates');
    return { title: 'Templates', columns: ['name', 'description', 'targetVendors', 'targetDeviceTypes', 'variables', 'tags', 'lastUsedAt', 'createdAt'], rows: (data.items || []).map((template) => ({
      name: template.name,
      description: template.description,
      targetVendors: template.targetVendors,
      targetDeviceTypes: template.targetDeviceTypes,
      variables: (template.variables || []).map((item) => item.name),
      tags: template.tags,
      lastUsedAt: date(template.lastUsedAt),
      createdAt: date(template.createdAt),
    })) };
  }

  if (pathname === '/jobs') {
    const { items } = await fetchAllItems('/jobs');
    return { title: 'Automation jobs', columns: ['name', 'type', 'status', 'total', 'completed', 'succeeded', 'failed', 'createdAt', 'startedAt', 'finishedAt'], rows: items.map((job) => ({
      name: job.name,
      type: job.type,
      status: job.status,
      total: job.total,
      completed: job.completed,
      succeeded: job.succeeded,
      failed: job.failed,
      createdAt: date(job.createdAt),
      startedAt: date(job.startedAt),
      finishedAt: date(job.finishedAt),
    })) };
  }

  if (pathname === '/schedules' || pathname === '/backups/schedules') {
    const { data } = await api.get('/schedules');
    return { title: 'Schedules', columns: ['name', 'type', 'cron', 'enabled', 'devices', 'template', 'nextRunAt', 'lastJob', 'createdAt'], rows: (data.items || []).map((schedule) => ({
      name: schedule.name,
      type: schedule.type,
      cron: schedule.cron,
      enabled: schedule.enabled,
      devices: (schedule.devices || []).map((device) => device.name),
      template: schedule.template?.name,
      nextRunAt: date(schedule.nextRunAt),
      lastJob: schedule.lastJob?.name,
      createdAt: date(schedule.createdAt),
    })) };
  }

  if (pathname === '/credentials') {
    const { data } = await api.get('/credentials');
    return { title: 'Credentials', columns: ['name', 'username', 'description', 'createdAt', 'updatedAt'], rows: (data.items || []).map((credential) => ({
      name: credential.name,
      username: credential.username,
      description: credential.description,
      createdAt: date(credential.createdAt),
      updatedAt: date(credential.updatedAt),
    })) };
  }

  if (pathname === '/users') {
    const { data } = await api.get('/users');
    return { title: 'Users', columns: ['name', 'email', 'role', 'active', 'createdAt', 'updatedAt'], rows: (data.items || []).map((user) => ({
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
      createdAt: date(user.createdAt),
      updatedAt: date(user.updatedAt),
    })) };
  }

  if (pathname === '/audit') {
    const { items } = await fetchAllItems('/audit');
    return { title: 'Audit log', columns: ['action', 'entity', 'user', 'createdAt'], rows: items.map((entry) => ({
      action: entry.action,
      entity: entry.entity,
      user: entry.userName || entry.user?.name,
      createdAt: date(entry.createdAt),
    })) };
  }

  if (pathname === '/') {
    const { data } = await api.get('/dashboard/summary');
    const rows = [];
    for (const [name, value] of Object.entries(data.devices || {})) rows.push({ category: 'Devices', metric: name, value: display(value) });
    rows.push({ category: 'Backups', metric: 'totalSnapshots', value: data.configs?.total || 0 });
    for (const item of data.jobs?.byStatus || []) rows.push({ category: 'Jobs', metric: item._id, value: item.count });
    return { title: 'Dashboard report', columns: ['category', 'metric', 'value'], rows };
  }

  throw new Error('Reports are not available for this page.');
}

export function escapeCsvCell(value) {
  let text = display(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function exportModuleReport(pathname, format) {
  const report = await reportFor(pathname);
  const safeTitle = report.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'report';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${safeTitle}-${timestamp}`;
  const headers = report.columns;
  const rows = report.rows.map((row) => headers.map((column) => display(row[column])));

  if (format === 'csv') {
    const csv = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
    downloadBlob(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }), `${filename}.csv`);
    return;
  }

  if (format === 'xlsx') {
    const writeExcelFile = (await import('write-excel-file/browser')).default;
    const data = [headers, ...rows].map((row, rowIndex) => row.map((value) => ({
      value: rowIndex === 0 ? value : value,
      fontWeight: rowIndex === 0 ? 'bold' : undefined,
    })));
    const blob = await writeExcelFile([{ data, sheet: report.title.slice(0, 31) }]).toBlob();
    downloadBlob(blob, `${filename}.xlsx`);
    return;
  }

  if (format === 'pdf') {
    const [{ jsPDF }, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const document = new jsPDF({ orientation: headers.length > 6 ? 'landscape' : 'portrait' });
    document.setFontSize(16);
    document.text(report.title, 14, 16);
    document.setFontSize(9);
    document.text(`${report.rows.length} record(s) · generated ${new Date().toLocaleString()}`, 14, 22);
    autoTableModule.default(document, {
      startY: 28,
      head: [headers],
      body: rows,
      styles: { fontSize: headers.length > 7 ? 6 : 8, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [17, 88, 120] },
      margin: { left: 10, right: 10 },
    });
    document.save(`${filename}.pdf`);
    return;
  }

  throw new Error('Unsupported report format.');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}