/**
 * authorityResolver.js
 * Resolves issue category, location, and zone to the appropriate authority handles
 */

class AuthorityResolver {
  constructor() {
    this.databases = {};
    this.centralDb = null;
    this.indexDb = null;
    this.initialized = false;
  }

  /**
   * Initialize the resolver by loading all databases
   */
  async initialize() {
    if (!isContextValid()) return;
    try {
      // Load index
      this.indexDb = await this.loadJson('authority_database/index.json');
      
      // Load central government database
      this.centralDb = await this.loadJson('authority_database/central.json');
      
      // Pre-load commonly used databases (can lazy-load others)
      const commonStates = ['karnataka', 'maharashtra', 'delhi', 'tamil_nadu', 'uttar_pradesh'];
      for (const state of commonStates) {
        if (!isContextValid()) break;
        await this.loadStateDatabase(state);
      }
      
      this.initialized = true;
      console.log('CivicTag: Authority databases initialized');
    } catch (error) {
      if (isContextValid()) {
        console.error('CivicTag: Failed to initialize authority databases', error);
      }
    }
  }

  /**
   * Load JSON file
   */
  async loadJson(path) {
    if (!isContextValid()) return null;
    try {
      const url = chrome.runtime.getURL(path);
      const response = await fetch(url);
      return await response.json();
    } catch (e) {
      if (e.message && e.message.includes('context invalidated')) {
        console.warn('CivicTag: Extension context invalidated.');
      } else if (isContextValid()) {
        console.error(`CivicTag: Failed to load ${path}`, e);
      }
      return null;
    }
  }

  /**
   * Load state database on demand
   */
  async loadStateDatabase(stateFileName) {
    if (this.databases[stateFileName]) {
      return this.databases[stateFileName];
    }

    try {
      const path = `authority_database/${stateFileName}.json`;
      const db = await this.loadJson(path);
      this.databases[stateFileName] = db;
      return db;
    } catch (error) {
      if (isContextValid()) {
        console.error(`CivicTag: Failed to load ${stateFileName}`, error);
      }
      return null;
    }
  }

  /**
   * Find state file from state name or code
   */
  findStateFile(stateNameOrCode) {
    if (!this.indexDb || !stateNameOrCode || typeof stateNameOrCode !== 'string') {
      return null;
    }

    const normalized = stateNameOrCode.trim();
    if (!normalized) return null;

    const allRegions = [...this.indexDb.states, ...this.indexDb.union_territories];
    
    const region = allRegions.find(s => 
      s.name.toLowerCase() === normalized.toLowerCase() ||
      s.code === normalized.toUpperCase()
    );

    return region ? region.file.replace('.json', '') : null;
  }

  /**
   * Normalize freely identified department to canonical category
   */
  normalizeDepartment(freeDepartment) {
    if (!freeDepartment) return 'general';

    const lower = freeDepartment.toLowerCase();
    
    const mappings = {
      // Water related
      'water supply': 'water', 'no water': 'water', 'water pipeline': 'water',
      'water leakage': 'water', 'dirty water': 'water', 'water board': 'water',
      'jal board': 'water', 'jal shakti': 'water', 'water crisis': 'water',
      
      // Roads related  
      'roads & potholes': 'roads', 'roads potholes': 'roads',
      'pothole': 'roads', 'road damage': 'roads',
      'broken road': 'roads', 'road construction': 'roads', 'speed breaker': 'roads',
      'highway': 'roads', 'street': 'roads',
      
      // Electricity
      'electricity': 'electricity', 'power cut': 'electricity', 'power outage': 'electricity',
      'no electricity': 'electricity', 'electric wire': 'electricity', 'transformer': 'electricity',
      'street light': 'electricity', 'streetlight': 'electricity', 'street lights': 'electricity',
      
      // Sanitation
      'garbage': 'sanitation', 'waste': 'sanitation', 'garbage collection': 'sanitation',
      'waste collection': 'sanitation', 'open defecation': 'sanitation', 'public toilet': 'sanitation',
      'sewage': 'drainage', 'drainage': 'drainage', 'gutter': 'drainage',
      
      // Animals
      'stray animals': 'animal_control', 'stray dogs': 'animal_control', 'stray': 'animal_control',
      'dog': 'animal_control', 'animal': 'animal_control', 'street animals': 'animal_control',
      
      // Building/Construction
      'illegal construction': 'building_dept', 'construction': 'building_dept',
      'encroachment': 'building_dept', 'land encroachment': 'building_dept',
      
      // Flooding/Waterlogging
      'waterlogging': 'drainage', 'flooding': 'drainage', 'flood': 'drainage',
      'waterlog': 'drainage',
      
      // Pollution
      'noise pollution': 'pollution', 'air pollution': 'pollution', 'pollution': 'pollution',
      'smoke': 'pollution', 'air quality': 'pollution',
      
      // Traffic
      'traffic': 'traffic', 'traffic jam': 'traffic', 'signal': 'traffic', 
      'parking': 'traffic', 'vehicle': 'traffic',
      
      // Crime
      'cyber crime': 'cyber_crime', 'cybercrime': 'cyber_crime',
      'crime': 'crime', 'theft': 'crime', 'harassment': 'crime', 'assault': 'crime',
      'robbery': 'crime', 'violence': 'crime',
      
      // Health
      'hospital': 'health', 'health': 'health', 'ambulance': 'health', 
      'medicine': 'health', 'emergency': 'health', 'medical': 'health',
      
      // Education
      'school': 'education', 'college': 'education', 'education': 'education',
      'teacher': 'education', 'university': 'education',
      
      // Vigilance/Corruption
      'corruption': 'vigilance', 'bribe': 'vigilance', 'vigilance': 'vigilance',
      
      // Fire
      'fire': 'fire_dept', 'fire safety': 'fire_dept', 'fire hazard': 'fire_dept',
      
      // Horticulture
      'tree': 'horticulture', 'park': 'horticulture', 'garden': 'horticulture',
      'trees': 'horticulture', 'tree falling': 'horticulture', 'tree fall': 'horticulture',
      
      // Railways
      'railway': 'railways', 'train': 'railways', 'station': 'railways',
      
      // Transport
      'metro': 'transport', 'metrorail': 'transport',
      
      // Transport (Public)
      'transport': 'transport', 'bus': 'transport', 'auto': 'transport',
      'public transport': 'transport'
    };
    
    // Try to find a match
    for (const [key, value] of Object.entries(mappings)) {
      if (lower.includes(key)) return value;
    }
    
    return 'general';
  }

  /**
   * Resolve authorities for a given complaint
   * @param {Object} classification - Classification result from classifier
   * @param {Object} location - Resolved location {state, city, district, zone}
   * @returns {Array} Array of suggested authority handles
   */
  /**
   * Determine which categories are eligible for CM escalation.
   * Categories inherently handled elsewhere (cyber_crime, railways) or
   * that go straight to central (health, education, vigilance, pollution)
   * are excluded so CM is not tagged unnecessarily.
   */
  _cmEligibleCategories() {
    return ['water','electricity','roads','sanitation','drainage','flooding',
            'crime','traffic','animal_control','building_dept','fire_dept',
            'horticulture','transport','general'];
  }

  async resolveAuthorities(classification, location) {
    if (!isContextValid()) return [];
    if (!classification || !classification.isComplaint) return [];

    const suggestions = [];
    const category  = this.normalizeDepartment(classification.department || 'General');
    const urgency   = classification.urgency;

    // ── TIER 0: Inherently-central categories — bypass state DB ──────────────
    if (category === 'cyber_crime') {
      return this.prioritizeAndDeduplicate(this.resolveCyberCrimeAuthorities());
    }
    if (category === 'railways') {
      return this.prioritizeAndDeduplicate(this.resolveRailwayAuthoritiesCentral());
    }

    // ── Load state DB ─────────────────────────────────────────────────────────
    const stateFile = this.findStateFile(location.state);
    const stateDb   = stateFile ? await this.loadStateDatabase(stateFile) : null;

    if (!stateFile || !stateDb) {
      // Unknown state — ask Groq for the local authority, then fall back to central
      const groqLocal = await this.resolveLocalAuthorityViaGroq(category, location);
      if (groqLocal) suggestions.push(groqLocal);
      if (suggestions.length === 0 || urgency === 'critical') {
        suggestions.push(...(await this.getCentralAuthorityForCategory(category)));
      }
      return this.prioritizeAndDeduplicate(suggestions);
    }

    // ── TIER 1: Category-specific LOCAL resolution ────────────────────────────
    switch (category) {
      case 'water':          suggestions.push(...this.resolveWaterAuthorities(stateDb, location));       break;
      case 'electricity':    suggestions.push(...this.resolveElectricityAuthorities(stateDb, location)); break;
      case 'roads':          suggestions.push(...this.resolveRoadAuthorities(stateDb, location));        break;
      case 'sanitation':     suggestions.push(...this.resolveSanitationAuthorities(stateDb, location));  break;
      case 'drainage':
      case 'flooding':       suggestions.push(...this.resolveDrainageAuthorities(stateDb, location));    break;
      case 'crime':          suggestions.push(...this.resolveCrimeAuthorities(stateDb, location));       break;
      case 'pollution':      suggestions.push(...this.resolvePollutionAuthorities(stateDb, location));   break;
      case 'transport':      suggestions.push(...this.resolveTransportAuthorities(stateDb, location));   break;
      case 'traffic':        suggestions.push(...this.resolveTrafficAuthorities(stateDb, location));     break;
      case 'health':         suggestions.push(...this.resolveHealthAuthorities(stateDb, location));      break;
      case 'education':      suggestions.push(...this.resolveEducationAuthorities(stateDb, location));   break;
      case 'animal_control': suggestions.push(...this.resolveAnimalAuthorities(stateDb, location));      break;
      case 'building_dept':  suggestions.push(...this.resolveBuildingAuthorities(stateDb, location));    break;
      case 'vigilance':      suggestions.push(...this.resolveVigilanceAuthorities(stateDb, location));   break;
      case 'fire_dept':      suggestions.push(...this.resolveFireAuthorities(stateDb, location));        break;
      case 'horticulture':   suggestions.push(...this.resolveHorticultureAuthorities(stateDb, location));break;
      default:               suggestions.push(...this.resolveGenericAuthorities(stateDb, location));     break;
    }

    // ── TIER 1b: Groq fallback when city not in DB ────────────────────────────
    const hasLocal = suggestions.some(s => s.level === 'local');
    if (!hasLocal) {
      const groqLocal = await this.resolveLocalAuthorityViaGroq(category, location);
      if (groqLocal) suggestions.push(groqLocal);
    }

    // ── TIER 3: CM — ONLY for 'critical' urgency on civic issues ─────────────
    const cmEligible = this._cmEligibleCategories().includes(category);
    if (urgency === 'critical' && cmEligible && stateDb.cm) {
      const cmEntry = stateDb.cm;
      if (cmEntry.dynamic && typeof DynamicResolver !== 'undefined') {
        const dynamic = await DynamicResolver.lookupRoleHandle(
          cmEntry.role_key || 'cm',
          location.state || stateDb.state_name,
          cmEntry
        );
        if (dynamic) {
          suggestions.push({
            handle: dynamic.handle, name: dynamic.name,
            level: 'state', priority: 2,
            isDynamic: dynamic.isDynamic, isStale: dynamic.isStale,
            dynamicConfidence: dynamic.confidence,
            roleKey: cmEntry.role_key || 'cm',
            stateName: location.state || stateDb.state_name
          });
        }
      } else {
        suggestions.push({ handle: cmEntry.handle, name: cmEntry.name || 'Chief Minister', level: 'state', priority: 2 });
      }
    }

    // ── TIER 4: Central ministry — ONLY when still no match, OR for inherently-central categories ─
    const centralOnlyCategories = ['pollution', 'health', 'education', 'vigilance'];
    const noMatchAtAll = suggestions.length === 0;
    if (noMatchAtAll || centralOnlyCategories.includes(category)) {
      suggestions.push(...(await this.getCentralAuthorityForCategory(category)));
    }

    return this.prioritizeAndDeduplicate(suggestions);
  }

  /**
   * Backend-powered live lookup for LOCAL authority (ward, city body, commissioner).
   * Results cached 24h in chrome.storage.local.
   */
  async resolveLocalAuthorityViaGroq(category, location) {
    if (!location.city && !location.state) return null;

    const safeSlug = s => (s||'').toLowerCase().replace(/[^a-z0-9]/g,'_');
    const cacheKey = `dynhandle_local_${safeSlug(category)}_${safeSlug(location.city||location.state)}`;

    // Cache check
    try {
      const cached = await safeStorageGet([cacheKey]);
      const entry = cached[cacheKey];
      if (entry && Date.now() < entry.expiresAt) {
        return { handle: entry.handle, name: entry.name, level: 'local', priority: 1,
          isDynamic: true, isStale: false, dynamicConfidence: entry.confidence };
      }
    } catch {}

    // Call backend
    try {
      const backendUrl = (typeof CIVICTAG_CONFIG !== 'undefined' ? CIVICTAG_CONFIG.BACKEND_URL : 'https://civictag-api.vercel.app');
      const res = await fetch(`${backendUrl}/api/local-authority`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CivicTag-Client': '1' },
        body: JSON.stringify({ category, city: location.city || null, state: location.state || null })
      });

      if (!res.ok) return null;
      const data = await res.json();

      if (!data?.handle || !data.handle.startsWith('@') || (data.confidence||0) < 75) return null;

      // Cache for 24h
      await safeStorageSet({ [cacheKey]: { handle: data.handle, name: data.name, confidence: data.confidence, cachedAt: Date.now(), expiresAt: Date.now() + 86400000 } }).catch(() => {});

      return { handle: data.handle, name: data.name || category, level: 'local', priority: 1,
        isDynamic: true, isStale: false, dynamicConfidence: data.confidence };
    } catch (err) {
      console.warn('CivicTag: local-authority backend call failed', err);
      return null;
    }
  }
  /**
   * Central-only railway authority resolution (used by TIER 0 and state fallback)
   */
  resolveRailwayAuthoritiesCentral() {
    if (this.centralDb?.central_government?.railways) {
      return [{ handle: this.centralDb.central_government.railways.handle,
                name: this.centralDb.central_government.railways.name,
                level: 'central', priority: 1 }];
    }
    return [];
  }

  /**
   * Resolve water-related authorities
   */
  resolveWaterAuthorities(stateDb, location) {
    const authorities = [];

    // City-level water authority
    if (location.city && stateDb.water) {
      const cityKey = location.city.toLowerCase().replace(/\s+/g, '_');
      if (stateDb.water[cityKey]) {
        authorities.push({
          handle: stateDb.water[cityKey].handle,
          name: stateDb.water[cityKey].name,
          level: 'local',
          priority: 1
        });
      }
    }

    // Municipal corporation
    if (location.city && stateDb.municipal) {
      const cityKey = location.city.toLowerCase().replace(/\s+/g, '_');
      if (stateDb.municipal[cityKey]) {
        authorities.push({
          handle: stateDb.municipal[cityKey].handle,
          name: stateDb.municipal[cityKey].name,
          level: 'local',
          priority: 1
        });
      }
    }

    // State water department
    if (stateDb.water && stateDb.water.phed) {
      authorities.push({
        handle: stateDb.water.phed.handle,
        name: stateDb.water.phed.name,
        level: 'state',
        priority: 2
      });
    }

    return authorities;
  }

  /**
   * Resolve electricity-related authorities
   */
  resolveElectricityAuthorities(stateDb, location) {
    const authorities = [];

    if (!stateDb.electricity) return authorities;

    // Find the correct DISCOM based on zone/city
    for (const [key, discom] of Object.entries(stateDb.electricity)) {
      if (discom.zones && location.city) {
        const cityMatch = discom.zones.some(zone => 
          zone.toLowerCase().includes(location.city.toLowerCase()) ||
          location.city.toLowerCase().includes(zone.toLowerCase())
        );
        
        if (cityMatch) {
          authorities.push({
            handle: discom.handle,
            name: discom.name,
            level: 'local',
            priority: 1,
            note: `Zone: ${discom.zones.join(', ')}`
          });
          break;
        }
      } else if (discom.area && location.city && 
                 discom.area.toLowerCase() === location.city.toLowerCase()) {
        authorities.push({
          handle: discom.handle,
          name: discom.name,
          level: 'local',
          priority: 1
        });
        break;
      }
    }

    // If no specific DISCOM found, add the first state electricity board
    if (authorities.length === 0) {
      const firstElecAuthority = Object.values(stateDb.electricity)[0];
      if (firstElecAuthority) {
        authorities.push({
          handle: firstElecAuthority.handle,
          name: firstElecAuthority.name,
          level: 'state',
          priority: 2
        });
      }
    }

    return authorities;
  }

  /**
   * Resolve road-related authorities
   */
  resolveRoadAuthorities(stateDb, location) {
    const authorities = [];

    // Municipal corporation for city roads
    if (location.city && stateDb.municipal) {
      const cityKey = location.city.toLowerCase().replace(/\s+/g, '_');
      if (stateDb.municipal[cityKey]) {
        authorities.push({
          handle: stateDb.municipal[cityKey].handle,
          name: stateDb.municipal[cityKey].name + ' (City Roads)',
          level: 'local',
          priority: 1
        });
      }
    }

    // PWD for state highways
    if (stateDb.pwd) {
      authorities.push({
        handle: stateDb.pwd.handle,
        name: stateDb.pwd.name + ' (State Highways)',
        level: 'state',
        priority: 2
      });
    } else if (stateDb.roads) {
      const roadAuthority = Object.values(stateDb.roads)[0];
      if (roadAuthority) {
        authorities.push({
          handle: roadAuthority.handle,
          name: roadAuthority.name,
          level: 'state',
          priority: 2
        });
      }
    }

    // NHAI for national highways (from central)
    if (this.centralDb?.central_government?.nhai) {
      authorities.push({
        handle: this.centralDb.central_government.nhai.handle,
        name: this.centralDb.central_government.nhai.name + ' (National Highways)',
        level: 'central',
        priority: 3
      });
    }

    return authorities;
  }

  /**
   * Resolve drainage/flooding authorities
   */
  resolveDrainageAuthorities(stateDb, location) {
    const authorities = [];

    // Municipal corporation
    if (location.city && stateDb.municipal) {
      const cityKey = location.city.toLowerCase().replace(/\s+/g, '_');
      if (stateDb.municipal[cityKey]) {
        authorities.push({
          handle: stateDb.municipal[cityKey].handle,
          name: stateDb.municipal[cityKey].name,
          level: 'local',
          priority: 1
        });
      }
    }

    // NDMA for disasters
    if (this.centralDb?.central_government?.ndma) {
      authorities.push({
        handle: this.centralDb.central_government.ndma.handle,
        name: this.centralDb.central_government.ndma.name,
        level: 'central',
        priority: 2
      });
    }

    return authorities;
  }

  /**
   * Resolve animal control authorities
   */
  resolveAnimalAuthorities(stateDb, location) {
    const authorities = [];

    // Municipal corporation (usually handles stray dogs/animals)
    if (location.city && stateDb.municipal) {
      const cityKey = location.city.toLowerCase().replace(/\s+/g, '_');
      if (stateDb.municipal[cityKey]) {
        authorities.push({
          handle: stateDb.municipal[cityKey].handle,
          name: stateDb.municipal[cityKey].name,
          level: 'local',
          priority: 1
        });
      }
    }

    // AWBI
    if (this.centralDb?.central_government?.awbi) {
      authorities.push({
        handle: this.centralDb.central_government.awbi.handle,
        name: this.centralDb.central_government.awbi.name,
        level: 'central',
        priority: 2
      });
    }

    return authorities;
  }

  /**
   * Resolve building/encroachment authorities
   */
  resolveBuildingAuthorities(stateDb, location) {
    const authorities = [];

    // Municipal corporation / Development Authority
    if (location.city && stateDb.municipal) {
      const cityKey = location.city.toLowerCase().replace(/\s+/g, '_');
      if (stateDb.municipal[cityKey]) {
        authorities.push({
          handle: stateDb.municipal[cityKey].handle,
          name: stateDb.municipal[cityKey].name,
          level: 'local',
          priority: 1
        });
      }
    }

    return authorities;
  }

  /**
   * Resolve education authorities — LOCAL first, central added by Tier 4
   */
  resolveEducationAuthorities(stateDb, location) {
    const authorities = [];
    // Local: municipal ward / corporation schools
    if (location.city && stateDb.municipal) {
      const ck = location.city.toLowerCase().replace(/\\s+/g, '_');
      if (stateDb.municipal[ck]) {
        authorities.push({ handle: stateDb.municipal[ck].handle, name: stateDb.municipal[ck].name + ' (Education)', level: 'local', priority: 1 });
      }
    }
    // State education dept if available
    if (stateDb.education && typeof stateDb.education === 'object') {
      const edu = Object.values(stateDb.education)[0];
      if (edu?.handle) authorities.push({ handle: edu.handle, name: edu.name, level: 'state', priority: 2 });
    }
    return authorities;
  }

  /**
   * Resolve sanitation authorities
   */
  resolveSanitationAuthorities(stateDb, location) {
    const authorities = [];

    // Municipal corporation
    if (location.city && stateDb.municipal) {
      const cityKey = location.city.toLowerCase().replace(/\s+/g, '_');
      if (stateDb.municipal[cityKey]) {
        authorities.push({
          handle: stateDb.municipal[cityKey].handle,
          name: stateDb.municipal[cityKey].name,
          level: 'local',
          priority: 1
        });
      }
    }

    // Swachh Bharat
    if (this.centralDb?.central_government?.swachh_bharat) {
      authorities.push({
        handle: this.centralDb.central_government.swachh_bharat.handle,
        name: this.centralDb.central_government.swachh_bharat.name,
        level: 'central',
        priority: 3
      });
    }

    return authorities;
  }

  /**
   * Resolve crime-related authorities
   */
  resolveCrimeAuthorities(stateDb, location) {
    const authorities = [];

    // City police
    if (location.city && stateDb.police) {
      const cityKey = location.city.toLowerCase().replace(/\s+/g, '_');
      if (stateDb.police[cityKey]) {
        authorities.push({
          handle: stateDb.police[cityKey].handle,
          name: stateDb.police[cityKey].name,
          level: 'local',
          priority: 1
        });
      }
    }

    // State police
    if (stateDb.police && stateDb.police.state) {
      authorities.push({
        handle: stateDb.police.state.handle,
        name: stateDb.police.state.name,
        level: 'state',
        priority: 2
      });
    }

    return authorities;
  }

  /**
   * Resolve traffic authorities
   */
  resolveTrafficAuthorities(stateDb, location) {
    const authorities = [];

    // City traffic police
    if (location.city && stateDb.police) {
      const cityKey = location.city.toLowerCase().replace(/\s+/g, '_') + '_traffic';
      if (stateDb.police[cityKey]) {
        authorities.push({
          handle: stateDb.police[cityKey].handle,
          name: stateDb.police[cityKey].name,
          level: 'local',
          priority: 1
        });
      } else {
        // Fallback to general police
        const genCityKey = location.city.toLowerCase().replace(/\s+/g, '_');
        if (stateDb.police[genCityKey]) {
          authorities.push({
            handle: stateDb.police[genCityKey].handle,
            name: stateDb.police[genCityKey].name,
            level: 'local',
            priority: 1
          });
        }
      }
    }

    return authorities;
  }

  /**
   * Resolve pollution authorities
   */
  resolvePollutionAuthorities(stateDb, location) {
    const authorities = [];

    // Central Pollution Control Board
    if (this.centralDb?.central_government?.cpcb) {
      authorities.push({
        handle: this.centralDb.central_government.cpcb.handle,
        name: this.centralDb.central_government.cpcb.name,
        level: 'central',
        priority: 1
      });
    }

    // Environment ministry
    if (this.centralDb?.central_government?.environment_ministry) {
      authorities.push({
        handle: this.centralDb.central_government.environment_ministry.handle,
        name: this.centralDb.central_government.environment_ministry.name,
        level: 'central',
        priority: 2
      });
    }

    return authorities;
  }

  /**
   * Resolve transport authorities
   */
  resolveTransportAuthorities(stateDb, location) {
    const authorities = [];

    if (stateDb.transport) {
      const transportAuthority = Object.values(stateDb.transport)[0];
      if (transportAuthority) {
        authorities.push({
          handle: transportAuthority.handle,
          name: transportAuthority.name,
          level: 'local',
          priority: 1
        });
      }
    }

    return authorities;
  }

  /**
   * Resolve health authorities — LOCAL first, then state, central added by Tier 4
   */
  resolveHealthAuthorities(stateDb, location) {
    const authorities = [];
    // Local: municipal health wing
    if (location.city && stateDb.municipal) {
      const ck = location.city.toLowerCase().replace(/\\s+/g, '_');
      if (stateDb.municipal[ck]) {
        authorities.push({ handle: stateDb.municipal[ck].handle, name: stateDb.municipal[ck].name + ' (Health Wing)', level: 'local', priority: 1 });
      }
    }
    // State health dept if available
    if (stateDb.health) {
      const h = Object.values(stateDb.health)[0];
      if (h?.handle) authorities.push({ handle: h.handle, name: h.name, level: 'state', priority: 2 });
    }
    return authorities;
  }

  /**
   * Resolve cyber crime authorities
   */
  resolveCyberCrimeAuthorities() {
    if (this.centralDb?.central_government?.cyber_crime) {
      return [{
        handle: this.centralDb.central_government.cyber_crime.handle,
        name: this.centralDb.central_government.cyber_crime.name,
        level: 'central',
        priority: 1
      }];
    }
    return [];
  }

  /**
   * Resolve vigilance authorities
   */
  resolveVigilanceAuthorities(stateDb, location) {
    const authorities = [];

    if (this.centralDb?.central_government?.vigilance) {
      authorities.push({
        handle: this.centralDb.central_government.vigilance.handle,
        name: this.centralDb.central_government.vigilance.name,
        level: 'central',
        priority: 2
      });
    }

    return authorities;
  }

  /**
   * Resolve fire department authorities
   */
  resolveFireAuthorities(stateDb, location) {
    const authorities = [];

    // Local police/municipal as fire is often under them
    if (location.city && stateDb.police) {
      const cityKey = location.city.toLowerCase().replace(/\s+/g, '_');
      if (stateDb.police[cityKey]) {
        authorities.push({
          handle: stateDb.police[cityKey].handle,
          name: stateDb.police[cityKey].name,
          level: 'local',
          priority: 1
        });
      }
    }

    return authorities;
  }

  /**
   * Resolve horticulture authorities
   */
  resolveHorticultureAuthorities(stateDb, location) {
    const authorities = [];

    // Municipal corporation
    if (location.city && stateDb.municipal) {
      const cityKey = location.city.toLowerCase().replace(/\s+/g, '_');
      if (stateDb.municipal[cityKey]) {
        authorities.push({
          handle: stateDb.municipal[cityKey].handle,
          name: stateDb.municipal[cityKey].name,
          level: 'local',
          priority: 1
        });
      }
    }

    return authorities;
  }

  /**
   * Resolve railway authorities (delegates to central method)
   */
  resolveRailwayAuthorities(stateDb, location) {
    return this.resolveRailwayAuthoritiesCentral();
  }

  /**
   * Get generic authorities
   */
  resolveGenericAuthorities(stateDb, location) {
    const authorities = [];

    if (location.city && stateDb.municipal) {
      const cityKey = location.city.toLowerCase().replace(/\s+/g, '_');
      if (stateDb.municipal[cityKey]) {
        authorities.push({
          handle: stateDb.municipal[cityKey].handle,
          name: stateDb.municipal[cityKey].name,
          level: 'local',
          priority: 1
        });
      }
    }

    return authorities;
  }

  /**
   * Get central authority for category
   */
  async getCentralAuthorityForCategory(category) {
    if (!this.centralDb || !this.centralDb.central_government) return [];

    const mapping = {
      water: 'water_ministry',
      electricity: 'power_ministry',
      roads: 'road_ministry',
      health: 'health_ministry',
      pollution: 'environment_ministry',
      transport: 'road_ministry',
      cyber_crime: 'cyber_crime',
      education: 'education_ministry',
      railways: 'railways',
      vigilance: 'vigilance',
      sanitation: 'swachh_bharat'
    };

    const key = mapping[category] || 'grievance_portal';
    const authority = this.centralDb.central_government[key];

    if (authority) {
      // Check if this entry should be dynamically resolved
      if (authority.dynamic && typeof DynamicResolver !== 'undefined') {
        const dynamic = await DynamicResolver.lookupRoleHandle(
          authority.role_key || key,
          'Central Government',
          authority
        );
        if (dynamic) {
          return [{
            handle: dynamic.handle,
            name: dynamic.name,
            level: 'central',
            priority: 3,
            isDynamic: dynamic.isDynamic,
            isStale: dynamic.isStale,
            dynamicConfidence: dynamic.confidence,
            roleKey: authority.role_key || key,
            stateName: 'Central Government'
          }];
        }
      }

      return [{
        handle: authority.handle,
        name: authority.name,
        level: 'central',
        priority: 3
      }];
    }

    return [];
  }

  /**
   * Prioritize and deduplicate suggestions
   */
  prioritizeAndDeduplicate(suggestions) {
    // Remove duplicates
    const seen = new Set();
    const unique = suggestions.filter(s => {
      if (seen.has(s.handle)) return false;
      seen.add(s.handle);
      return true;
    });

    // Sort by priority
    unique.sort((a, b) => a.priority - b.priority);

    // Return top 4: local (1-2) + optional state dept + optional CM
    return unique.slice(0, 4);
  }

  /**
   * Get hashtags for category
   */
  getHashtagsForCategory(category, location) {
    const hashtags = [];
    
    const categoryTags = {
      water: ['#WaterCrisis', '#NoWater'],
      electricity: ['#PowerCut', '#NoElectricity'],
      roads: ['#BadRoads', '#Potholes'],
      sanitation: ['#SwachhBharat', '#Cleanliness'],
      crime: '#SafetyFirst',
      pollution: '#Pollution',
      flooding: '#Flooding'
    };

    if (categoryTags[category]) {
      const tag = Array.isArray(categoryTags[category]) 
        ? categoryTags[category][0] 
        : categoryTags[category];
      hashtags.push(tag);
    }

    // Add city hashtag
    if (location.city) {
      hashtags.push(`#${location.city.replace(/\s+/g, '')}`);
    }

    return hashtags;
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AuthorityResolver;
}
