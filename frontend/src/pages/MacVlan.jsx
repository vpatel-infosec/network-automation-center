import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import api, { apiErrorMessage } from '../api/client.js';
import { ConfirmDialog, EmptyState, Field, Spinner, StatusBadge, useToast } from '../components/ui.jsx';

export default function MacVlan() {
  const toast = useToast();
  const [sites, setSites] = useState([]);
  const [site, setSite] = useState('');
  const [macAddress, setMacAddress] = useState('');
  const [vlan, setVlan] = useState('');
  const [searching, setSearching] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [searchResult, setSearchResult] = useState(null);
  const [selectedMatch, setSelectedMatch] = useState(null);

  useEffect(() => {
    api.get('/meta')
      .then(({ data }) => setSites(data.sites))
      .catch((error) => toast.error(apiErrorMessage(error)));
  }, [toast]);

  const search = async (event) => {
    event?.preventDefault();
    setSearching(true);
    setSearchResult(null);
    setSelectedMatch(null);
    try {
      const { data } = await api.post('/devices/mac-vlan/search', { site, macAddress });
      setSearchResult(data);
      if (!data.scanned) toast.info('No switches are registered for this site');
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setSearching(false);
    }
  };

  const found = searchResult?.matches || [];
  const uniqueMatch = found.length === 1 && found[0].status === 'found' ? found[0] : null;
  const vlanNumber = Number(vlan);
  const validVlan = Number.isInteger(vlanNumber) && vlanNumber >= 1 && vlanNumber <= 4094;

  const assign = async () => {
    if (!selectedMatch || !validVlan) return;
    setAssigning(true);
    try {
      await api.post('/devices/mac-vlan/assign', {
        site,
        deviceId: selectedMatch.deviceId,
        macAddress,
        port: selectedMatch.ports[0],
        vlan: vlanNumber,
      });
      toast.success(`VLAN ${vlanNumber} assigned on ${selectedMatch.deviceName} ${selectedMatch.ports[0]}`);
      setSelectedMatch(null);
      await search();
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h2>MAC-based VLAN assignment</h2>
          <p className="muted small">Search switch MAC tables within one site, verify the learned port, then apply an access VLAN.</p>
        </div>
      </div>

      <nav className="row gap" aria-label="Template tools">
        <NavLink to="/templates" end className={({ isActive }) => `btn sm ${isActive ? 'primary' : 'ghost'}`}>
          Configuration templates
        </NavLink>
        <NavLink to="/templates/site-vlan" className={({ isActive }) => `btn sm ${isActive ? 'primary' : 'ghost'}`}>
          Add VLAN to site
        </NavLink>
        <NavLink to="/templates/mac-vlan" className={({ isActive }) => `btn sm ${isActive ? 'primary' : 'ghost'}`}>
          MAC VLAN assignment
        </NavLink>
      </nav>

      <form className="card filters" onSubmit={search}>
        <Field label="Site / plant" required>
          <select className="input" value={site} onChange={(event) => { setSite(event.target.value); setSearchResult(null); }} required>
            <option value="">Select a site...</option>
            {sites.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="MAC address" required>
          <input
            className="input mono"
            value={macAddress}
            onChange={(event) => { setMacAddress(event.target.value); setSearchResult(null); }}
            placeholder="aa:bb:cc:dd:ee:ff"
            autoComplete="off"
            required
          />
        </Field>
        <Field label="New VLAN" required hint="VLAN ID from 1 to 4094">
          <input className="input" type="number" min="1" max="4094" step="1" value={vlan} onChange={(event) => setVlan(event.target.value)} required />
        </Field>
        <button type="submit" className="btn primary" disabled={searching || !site || !macAddress.trim()}>
          {searching ? 'Searching switches...' : 'Search MAC'}
        </button>
      </form>

      {searching ? <Spinner label={`Checking switches in ${site}...`} /> : null}

      {searchResult ? (
        <section className="card">
          <div className="card-head">
            <div>
              <h3>{searchResult.macAddress} · {searchResult.site}</h3>
              <span className="muted small">Searched {searchResult.scanned} switch(es)</span>
            </div>
            {uniqueMatch && validVlan ? (
              <button type="button" className="btn primary" onClick={() => setSelectedMatch(uniqueMatch)}>
                Review VLAN change
              </button>
            ) : null}
          </div>
          {!searchResult.results.length ? (
            <EmptyState title="No switches in this site" message="Add switches and assign them to this site before searching." />
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr><th>Switch</th><th>Vendor / platform</th><th>MAC table result</th><th>Port</th></tr>
                </thead>
                <tbody>
                  {searchResult.results.map((result) => (
                    <tr key={result.deviceId}>
                      <td>{result.deviceName}<span className="muted small block">{result.host}</span></td>
                      <td>{result.vendor}<span className="muted small block">{result.platform || 'platform not specified'}</span></td>
                      <td><StatusBadge status={result.status} label={result.status.replace('_', ' ')} />{result.message ? <span className="muted small block">{result.message}</span> : null}</td>
                      <td className="mono">{result.ports?.join(', ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {found.length > 1 ? <p className="notice notice-error" style={{ margin: 16 }}>The MAC appears on multiple switches or ports. Resolve the duplicate location before assigning a VLAN.</p> : null}
          {found.length === 1 && found[0].status === 'ambiguous' ? <p className="notice notice-error" style={{ margin: 16 }}>This switch reports the MAC on more than one port. No change is available until the location is unambiguous.</p> : null}
        </section>
      ) : null}

      {selectedMatch ? (
        <ConfirmDialog
          title="Confirm access-port change"
          message={`MAC ${searchResult.macAddress} is currently learned on ${selectedMatch.deviceName} (${selectedMatch.host}), port ${selectedMatch.ports[0]}. This will shut the port, assign access VLAN ${vlanNumber}, re-enable the port, and save the configuration. The MAC location will be checked again immediately before the change. The endpoint may briefly disconnect.`}
          confirmLabel={`Assign VLAN ${vlanNumber}`}
          danger
          busy={assigning}
          onConfirm={assign}
          onCancel={() => setSelectedMatch(null)}
        />
      ) : null}
    </div>
  );
}