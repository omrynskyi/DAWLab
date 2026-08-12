import React, { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, Check, ExternalLink } from 'lucide-react';
import { PluginInfo } from '@/types/project.types';
import './PluginSection.css';

interface InstalledPlugin {
  name: string;
  type: 'AU' | 'VST3' | 'VST2';
  path: string;
}

interface PluginSectionProps {
  plugins: PluginInfo[];
}

// MOCK: when true, every plugin renders as installed (green) for demo purposes.
// Set to false to restore real local plugin detection.
const MOCK_ALL_INSTALLED = true;

/**
 * Check if a project plugin is locally installed.
 * Uses case-insensitive, whitespace-insensitive substring matching.
 */
function isPluginInstalled(pluginName: string, installedPlugins: InstalledPlugin[]): boolean {
  const needle = pluginName.toLowerCase().replace(/\s+/g, '');
  return installedPlugins.some(installed => {
    const haystack = installed.name.replace(/\s+/g, '');
    return haystack.includes(needle) || needle.includes(haystack);
  });
}

export const PluginSection: React.FC<PluginSectionProps> = ({ plugins }) => {
  const [installedPlugins, setInstalledPlugins] = useState<InstalledPlugin[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInstalled = async () => {
      try {
        const result = await window.ipcRenderer.invoke('get-installed-plugins');
        setInstalledPlugins(result || []);
      } catch (err) {
        console.error('[PluginSection] Failed to fetch installed plugins:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchInstalled();
  }, []);

  // Deduplicate plugins by name (keep first occurrence)
  const uniquePlugins = useMemo(() => {
    const seen = new Set<string>();
    return plugins.filter(p => {
      const key = p.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [plugins]);

  // Split into instruments and effects
  const { instruments, effects } = useMemo(() => {
    const instruments: (PluginInfo & { installed: boolean })[] = [];
    const effects: (PluginInfo & { installed: boolean })[] = [];

    uniquePlugins.forEach(plugin => {
      const installed = MOCK_ALL_INSTALLED || isPluginInstalled(plugin.name, installedPlugins);
      const enriched = { ...plugin, installed };
      if (plugin.is_instrument) {
        instruments.push(enriched);
      } else {
        effects.push(enriched);
      }
    });

    // Sort: missing first, then alphabetical
    const sortFn = (a: typeof instruments[0], b: typeof instruments[0]) => {
      if (a.installed !== b.installed) return a.installed ? 1 : -1;
      return a.name.localeCompare(b.name);
    };
    instruments.sort(sortFn);
    effects.sort(sortFn);

    return { instruments, effects };
  }, [uniquePlugins, installedPlugins]);

  const handleGetPlugin = (plugin: PluginInfo) => {
    const query = plugin.manufacturer && plugin.manufacturer !== 'Unknown'
      ? `${plugin.name} ${plugin.manufacturer} plugin download`
      : `${plugin.name} audio plugin download`;
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    window.ipcRenderer.invoke('open-external-url', url);
  };

  if (loading) {
    return (
      <div className="plugin-section">
        <h2 className="plugin-section-title">Plugins</h2>
        <div className="plugin-container">
          <div className="plugin-loading">Scanning plugins...</div>
        </div>
      </div>
    );
  }



  return (
    <div className="plugin-section">
      <div className="plugin-container">
        {uniquePlugins.length === 0 ? (
          <div className="plugin-empty">No plugins detected in this project</div>
        ) : (
          <>
            {instruments.length > 0 && (
              <PluginGroup
                label="Instruments"
                plugins={instruments}
                keyPrefix="inst"
                onGetPlugin={handleGetPlugin}
              />
            )}

            {effects.length > 0 && (
              <PluginGroup
                label="Effects"
                plugins={effects}
                keyPrefix="fx"
                onGetPlugin={handleGetPlugin}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};

interface PluginGroupProps {
  label: string;
  plugins: (PluginInfo & { installed: boolean })[];
  keyPrefix: string;
  onGetPlugin: (plugin: PluginInfo) => void;
}

const PluginGroup: React.FC<PluginGroupProps> = ({ label, plugins, keyPrefix, onGetPlugin }) => {
  const missing = plugins.filter(p => !p.installed);
  const installed = plugins.filter(p => p.installed);

  return (
    <div className="plugin-group">
      <div className="plugin-group-label">{label}</div>
      {missing.length > 0 && (
        <div className="plugin-missing-group">
          {missing.map((plugin, i) => (
            <PluginRow
              key={`${keyPrefix}-miss-${i}`}
              plugin={plugin}
              installed={false}
              onGetPlugin={onGetPlugin}
            />
          ))}
        </div>
      )}
      {installed.map((plugin, i) => (
        <PluginRow
          key={`${keyPrefix}-ok-${i}`}
          plugin={plugin}
          installed={true}
          onGetPlugin={onGetPlugin}
        />
      ))}
    </div>
  );
};

interface PluginRowProps {
  plugin: PluginInfo;
  installed: boolean;
  onGetPlugin: (plugin: PluginInfo) => void;
}

const PluginRow: React.FC<PluginRowProps> = ({ plugin, installed, onGetPlugin }) => {
  return (
    <div className={`plugin-row ${installed ? '' : 'plugin-row-missing'}`}>
      <span className={`plugin-status-icon ${installed ? 'installed' : 'missing'}`}>
        {installed ? <Check size={16} /> : <AlertTriangle size={16} />}
      </span>
      <span className="plugin-name-group">
        <span className="plugin-name">{plugin.name}</span>
        {plugin.manufacturer && plugin.manufacturer !== 'Unknown' && (
          <span className="plugin-manufacturer">{plugin.manufacturer}</span>
        )}
      </span>
      {!installed ? (
        <button
          className="plugin-get-btn"
          onClick={(e) => {
            e.stopPropagation();
            onGetPlugin(plugin);
          }}
          title="Search for plugin"
        >
          Get plugin <ExternalLink size={12} />
        </button>
      ) : (
        <span />
      )}
      <span className="plugin-type-badge">{plugin.type}</span>
    </div>
  );
};
