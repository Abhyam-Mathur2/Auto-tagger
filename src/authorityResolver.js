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
    try {
      // Load index
      this.indexDb = await this.loadJson('authority_database/index.json');
      
      // Load central government database
      this.centralDb = await this.loadJson('authority_database/central.json');
      
      // Pre-load commonly used databases (can lazy-load others)
      const commonStates = ['karnataka', 'maharashtra', 'delhi', 'tamil_nadu', 'uttar_pradesh'];
      for (const state of commonStates) {
        await this.loadStateDatabase(state);
      }
      
      this.initialized = true;
      console.log('CivicTag: Authority databases initialized');
    } catch (error) {
      console.error('CivicTag: Failed to initialize authority databases', error);
    }
  }

  /**
   * Load JSON file
   */
  async loadJson(path) {
    const url = chrome.runtime.getURL(path);
    const response = await fetch(url);
    return await response.json();
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
      console.error(`CivicTag: Failed to load ${stateFileName}`, error);
      return null;
    }
  }

  /**
   * Find state file from state name or code
   */
  findStateFile(stateNameOrCode) {
    if (!this.indexDb) return null;

    const allRegions = [...this.indexDb.states, ...this.indexDb.union_territories];
    
    const region = allRegions.find(s => 
      s.name.toLowerCase() === stateNameOrCode.toLowerCase() ||
      s.code === stateNameOrCode.toUpperCase()
    );

    return region ? region.file.replace('.json', '') : null;
  }

  /**
   * Resolve authorities for a given complaint
   */
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
      'crime': 'crime', 'theft': 'crime', 'harassment': 'crime', 'assault': 'crime',
      'robbery': 'crime', 'violence': 'crime', 'cyber crime': 'crime', 'cybercrime': 'crime',
      
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
  async resolveAuthorities(classification, location) {
    if (!classification || !classification.isComplaint) {
      return [];
    }

    const suggestions = [];
    const department = classification.department || 'General';
    const category = this.normalizeDepartment(department);
    const urgency = classification.urgency;

    // Load state database
    const stateFile = this.findStateFile(location.state);
    if (!stateFile) {
      console.warn('CivicTag: State not found', location.state);
      return this.getCentralAuthorityForCategory(category);
    }

    const stateDb = await this.loadStateDatabase(stateFile);
    if (!stateDb) {
      return this.getCentralAuthorityForCategory(category);
    }

    // Resolve based on category
    switch (category) {
      case 'water':
        suggestions.push(...this.resolveWaterAuthorities(stateDb, location));
        break;
      case 'electricity':
        suggestions.push(...this.resolveElectricityAuthorities(stateDb, location));
        break;
      case 'roads':
        suggestions.push(...this.resolveRoadAuthorities(stateDb, location));
        break;
      case 'sanitation':
        suggestions.push(...this.resolveSanitationAuthorities(stateDb, location));
        break;
      case 'crime':
        suggestions.push(...this.resolveCrimeAuthorities(stateDb, location));
        break;
      case 'pollution':
        suggestions.push(...this.resolvePollutionAuthorities(stateDb, location));
        break;
      case 'transport':
        suggestions.push(...this.resolveTransportAuthorities(stateDb, location));
        break;
      case 'health':
        suggestions.push(...this.resolveHealthAuthorities(stateDb, location));
        break;
      case 'cyber_crime':
        suggestions.push(...this.resolveCyberCrimeAuthorities());
        break;
      case 'flooding':
        suggestions.push(...this.resolveFloodingAuthorities(stateDb, location));
        break;
      default:
        suggestions.push(...this.resolveGenericAuthorities(stateDb, location));
    }

    // Add state-level authority for high/critical urgency
    if ((urgency === 'high' || urgency === 'critical') && stateDb.cm) {
      suggestions.push({
        handle: stateDb.cm.handle,
        name: stateDb.cm.name || 'Chief Minister',
        level: 'state',
        priority: urgency === 'critical' ? 1 : 2
      });
    }

    // Add central authorities for critical issues or as fallback
    if (urgency === 'critical' || suggestions.length === 0) {
      const centralAuthority = this.getCentralAuthorityForCategory(category);
      suggestions.push(...centralAuthority);
    }

    // Sort by priority and deduplicate
    return this.prioritizeAndDeduplicate(suggestions);
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
      authorities.push({
        handle: roadAuthority.handle,
        name: roadAuthority.name,
        level: 'state',
        priority: 2
      });
    }

    // NHAI for national highways (from central)
    authorities.push({
      handle: this.centralDb.central_government.nhai.handle,
      name: this.centralDb.central_government.nhai.name + ' (National Highways)',
      level: 'central',
      priority: 3
    });

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
    authorities.push({
      handle: this.centralDb.central_government.swachh_bharat.handle,
      name: this.centralDb.central_government.swachh_bharat.name,
      level: 'central',
      priority: 3
    });

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
   * Resolve pollution authorities
   */
  resolvePollutionAuthorities(stateDb, location) {
    const authorities = [];

    // Central Pollution Control Board
    authorities.push({
      handle: this.centralDb.central_government.cpcb.handle,
      name: this.centralDb.central_government.cpcb.name,
      level: 'central',
      priority: 1
    });

    // Environment ministry
    authorities.push({
      handle: this.centralDb.central_government.environment_ministry.handle,
      name: this.centralDb.central_government.environment_ministry.name,
      level: 'central',
      priority: 2
    });

    return authorities;
  }

  /**
   * Resolve transport authorities
   */
  resolveTransportAuthorities(stateDb, location) {
    const authorities = [];

    if (stateDb.transport) {
      const transportAuthority = Object.values(stateDb.transport)[0];
      authorities.push({
        handle: transportAuthority.handle,
        name: transportAuthority.name,
        level: 'local',
        priority: 1
      });
    }

    return authorities;
  }

  /**
   * Resolve health authorities
   */
  resolveHealthAuthorities(stateDb, location) {
    const authorities = [];

    // Health ministry
    authorities.push({
      handle: this.centralDb.central_government.health_ministry.handle,
      name: this.centralDb.central_government.health_ministry.name,
      level: 'central',
      priority: 2
    });

    return authorities;
  }

  /**
   * Resolve cyber crime authorities
   */
  resolveCyberCrimeAuthorities() {
    return [{
      handle: this.centralDb.central_government.cyber_crime.handle,
      name: this.centralDb.central_government.cyber_crime.name,
      level: 'central',
      priority: 1
    }];
  }

  /**
   * Resolve flooding authorities
   */
  resolveFloodingAuthorities(stateDb, location) {
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
    authorities.push({
      handle: this.centralDb.central_government.ndma.handle,
      name: this.centralDb.central_government.ndma.name,
      level: 'central',
      priority: 2
    });

    return authorities;
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
  getCentralAuthorityForCategory(category) {
    const mapping = {
      water: 'water_ministry',
      electricity: 'power_ministry',
      roads: 'road_ministry',
      health: 'health_ministry',
      pollution: 'environment_ministry',
      transport: 'road_ministry',
      cyber_crime: 'cyber_crime'
    };

    const key = mapping[category] || 'grievance_portal';
    const authority = this.centralDb.central_government[key];

    if (authority) {
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

    // Return top 3
    return unique.slice(0, 3);
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
