// FAA Regulatory Constants
// Comprehensive reference to Title 14 CFR (Code of Federal Regulations)
// Used across the application for compliance checking, audit reports, and regulatory citations

// ============================================
// 14 CFR PART 61 - CERTIFICATION: PILOTS, FLIGHT INSTRUCTORS, AND GROUND INSTRUCTORS
// ============================================

export const FAR_PART_61 = {
  // Pilot Certificate Types (14 CFR 61.5)
  CERTIFICATE_TYPES: {
    section: '14 CFR 61.5',
    title: 'Certificates and ratings issued under this part',
    types: [
      'Student Pilot',
      'Recreational Pilot',
      'Private Pilot (PPL)',
      'Commercial Pilot (CPL)',
      'Airline Transport Pilot (ATP)',
      'Sport Pilot',
      'Flight Instructor (CFI)',
      'Flight Instructor - Instrument (CFII)',
      'Ground Instructor',
    ],
  },

  // Category and Class Ratings (14 CFR 61.5(b))
  CATEGORY_CLASS_RATINGS: {
    section: '14 CFR 61.5(b)',
    categories: [
      'Airplane Single-Engine Land (ASEL)',
      'Airplane Single-Engine Sea (ASES)',
      'Airplane Multi-Engine Land (AMEL)',
      'Airplane Multi-Engine Sea (AMES)',
      'Rotorcraft Helicopter',
      'Rotorcraft Gyroplane',
      'Glider',
      'Lighter-Than-Air Airship',
      'Lighter-Than-Air Balloon',
      'Powered Parachute Land',
      'Powered Parachute Sea',
      'Weight-Shift-Control Land',
      'Weight-Shift-Control Sea',
    ],
  },

  // Medical Certificate Requirements (14 CFR 61.23)
  MEDICAL: {
    section: '14 CFR 61.23',
    title: 'Medical certificates: Requirement and duration',
    classes: {
      FIRST_CLASS: {
        section: '14 CFR 61.23(d)(1)',
        description: 'First-class medical certificate',
        requiredFor: 'ATP privileges',
        duration: {
          under40: 12, // months
          over40: 6,   // months
        },
      },
      SECOND_CLASS: {
        section: '14 CFR 61.23(d)(2)',
        description: 'Second-class medical certificate',
        requiredFor: 'Commercial pilot privileges',
        duration: 12, // months (all ages)
      },
      THIRD_CLASS: {
        section: '14 CFR 61.23(d)(3)',
        description: 'Third-class medical certificate',
        requiredFor: 'Private/recreational/student pilot privileges',
        duration: {
          under40: 60, // months
          over40: 24,  // months
        },
      },
      BASICMED: {
        section: '14 CFR 61.23(c)(3)',
        description: 'BasicMed (CACI alternative to third-class medical)',
        requiredFor: 'Private pilot operations within BasicMed limitations',
        limitations: [
          'Aircraft with max 6 seats and max 6,000 lbs',
          'Operations within the United States at or below 18,000 feet MSL',
          'Not exceeding 250 knots indicated airspeed',
          'No compensation or hire',
          'Must carry no more than 5 passengers',
        ],
        renewalPeriod: 48, // months for CMEC, physical exam every 48 months
        onlineCourseRequired: true,
      },
    },
    sportPilotMedical: {
      section: '14 CFR 61.23(c)(2)',
      description: 'Sport pilot: valid US drivers license in lieu of medical',
    },
  },

  // Flight Review (14 CFR 61.56)
  FLIGHT_REVIEW: {
    section: '14 CFR 61.56',
    title: 'Flight review',
    requirements: {
      frequency: 24, // months
      minimumFlightTime: 1, // hour of flight training
      minimumGroundTime: 1, // hour of ground training
      description: 'Review of current general operating and flight rules of 14 CFR Part 91 and a review of maneuvers and procedures necessary for safe exercise of pilot privileges',
    },
    alternatives: [
      'Passed a pilot proficiency check or practical test within preceding 24 months',
      'Completed a phase of an FAA-sponsored pilot proficiency program (WINGS)',
      'Completed a Part 121/135 pilot-in-command proficiency check',
    ],
  },

  // Recent Experience / Currency (14 CFR 61.57)
  CURRENCY: {
    section: '14 CFR 61.57',
    title: 'Recent experience: Pilot in command',

    // General day currency
    DAY_CURRENCY: {
      section: '14 CFR 61.57(a)',
      description: 'Carrying passengers - day',
      requirements: {
        landings: 3,       // 3 takeoffs and landings
        period: 90,        // within preceding 90 days
        landingType: 'full-stop (tailwheel) or to a full stop or touch-and-go (other)',
        sameCategory: true, // same category, class, and type (if type rating required)
      },
    },

    // Night currency
    NIGHT_CURRENCY: {
      section: '14 CFR 61.57(b)',
      description: 'Carrying passengers - night',
      requirements: {
        landings: 3,          // 3 takeoffs and landings to a full stop
        period: 90,           // within preceding 90 days
        timeFrame: '1 hour after sunset to 1 hour before sunrise',
        landingType: 'full-stop',
        sameCategory: true,
      },
    },

    // IFR Currency
    IFR_CURRENCY: {
      section: '14 CFR 61.57(c)',
      title: 'Instrument experience',
      requirements: {
        period: 6,             // months - within preceding 6 calendar months
        approaches: 6,         // 6 instrument approaches
        holdingProcedures: true,
        interceptingTracking: true, // intercepting and tracking courses through use of navigational electronic systems
      },
      gracePeriod: {
        section: '14 CFR 61.57(c)(2)',
        description: 'Additional 6 months to complete an instrument proficiency check (IPC)',
        totalMonths: 12, // 6 months + 6 months grace = IPC required after 12 months of non-currency
      },
    },

    // Night vision goggles
    NVG_CURRENCY: {
      section: '14 CFR 61.57(f)',
      description: 'Night vision goggle operations',
    },
  },

  // Endorsement Requirements
  ENDORSEMENTS: {
    HIGH_PERFORMANCE: {
      section: '14 CFR 61.31(f)',
      title: 'High-performance aircraft',
      description: 'Required for aircraft with engine of more than 200 horsepower',
    },
    COMPLEX: {
      section: '14 CFR 61.31(e)',
      title: 'Complex aircraft',
      description: 'Required for aircraft with retractable gear, flaps, and controllable propeller',
    },
    HIGH_ALTITUDE: {
      section: '14 CFR 61.31(g)',
      title: 'Pressurized aircraft capable of operating at high altitudes',
      description: 'Required for pressurized aircraft with service ceiling or max operating altitude above 25,000 feet MSL',
    },
    TAILWHEEL: {
      section: '14 CFR 61.31(i)',
      title: 'Tailwheel aircraft',
      description: 'Required for PIC of tailwheel aircraft',
    },
    SOLO: {
      section: '14 CFR 61.87',
      title: 'Solo requirements for student pilots',
      description: 'Pre-solo flight training and endorsement requirements',
    },
    SOLO_CROSS_COUNTRY: {
      section: '14 CFR 61.93',
      title: 'Solo cross-country flight requirements',
      description: 'Required for student pilot cross-country solo flights',
    },
    CHECKRIDE: {
      section: '14 CFR 61.39',
      title: 'Prerequisites for practical tests',
      description: 'Instructor endorsement for practical test (checkride)',
    },
    KNOWLEDGE_TEST: {
      section: '14 CFR 61.35',
      title: 'Knowledge test: Prerequisites and passing grades',
      description: 'Instructor endorsement for knowledge test',
    },
  },

  // Sport Pilot (14 CFR 61 Subpart J)
  SPORT_PILOT: {
    section: '14 CFR 61.303-61.327',
    title: 'Sport pilots',
    limitations: [
      'Light-sport aircraft only',
      'Daytime VFR only (unless endorsed for night)',
      'Max 2 occupants',
      'Max 10,000 feet MSL or 2,000 feet AGL (whichever is higher)',
      'No flight in Class A, B, C, or D airspace without endorsement',
      'No flight for compensation or hire',
    ],
  },
} as const;

// ============================================
// 14 CFR PART 91 - GENERAL OPERATING AND FLIGHT RULES
// ============================================

export const FAR_PART_91 = {
  // Required Instruments and Equipment (14 CFR 91.205)
  REQUIRED_INSTRUMENTS: {
    section: '14 CFR 91.205',
    title: 'Powered civil aircraft with standard category U.S. airworthiness certificates: Instrument and equipment requirements',

    // VFR Day - "ATOMATOFLAMES" or "A TOMATO FLAMES"
    VFR_DAY: {
      section: '14 CFR 91.205(b)',
      mnemonic: 'A-TOMATO-FLAMES',
      items: [
        { code: 'A', item: 'Airspeed Indicator', required: true },
        { code: 'T', item: 'Tachometer (for each engine)', required: true },
        { code: 'O', item: 'Oil Pressure Gauge (for each engine)', required: true },
        { code: 'M', item: 'Manifold Pressure Gauge (for each altitude engine)', required: true },
        { code: 'A', item: 'Altimeter', required: true },
        { code: 'T', item: 'Temperature Gauge (for each liquid-cooled engine)', required: true },
        { code: 'O', item: 'Oil Temperature Gauge (for each air-cooled engine)', required: true },
        { code: 'F', item: 'Fuel Gauge (for each tank)', required: true },
        { code: 'L', item: 'Landing Gear Position Indicator (if retractable)', required: true },
        { code: 'A', item: 'Anti-collision Light System (approved aviation red or white)', required: true },
        { code: 'M', item: 'Magnetic Direction Indicator (compass)', required: true },
        { code: 'E', item: 'ELT (Emergency Locator Transmitter)', required: true },
        { code: 'S', item: 'Safety Belts (and shoulder harness for front seats after 1978)', required: true },
      ],
    },

    // VFR Night - add "FLAPS" to day requirements
    VFR_NIGHT: {
      section: '14 CFR 91.205(c)',
      mnemonic: 'FLAPS (added to day requirements)',
      additionalItems: [
        { code: 'F', item: 'Fuses (spare set or circuit breakers)', required: true },
        { code: 'L', item: 'Landing Light (if operated for hire)', required: true },
        { code: 'A', item: 'Anti-collision Light System', required: true },
        { code: 'P', item: 'Position Lights (nav lights)', required: true },
        { code: 'S', item: 'Source of Electrical Energy (adequate for all installed equipment)', required: true },
      ],
    },

    // IFR Additional - add "GRABCARD" to day+night
    IFR: {
      section: '14 CFR 91.205(d)',
      mnemonic: 'GRABCARD (added to VFR night requirements)',
      additionalItems: [
        { code: 'G', item: 'Generator/Alternator (adequate for IFR)', required: true },
        { code: 'R', item: 'Radios (nav and comm appropriate for route)', required: true },
        { code: 'A', item: 'Altimeter (sensitive, adjustable)', required: true },
        { code: 'B', item: 'Ball (slip-skid indicator / inclinometer)', required: true },
        { code: 'C', item: 'Clock (hours, minutes, seconds with sweep second pointer or digital)', required: true },
        { code: 'A', item: 'Attitude Indicator', required: true },
        { code: 'R', item: 'Rate-of-Turn Indicator (or turn coordinator)', required: true },
        { code: 'D', item: 'DME or suitable RNAV at FL240+ (if VOR required)', required: true },
        { code: 'D', item: 'Directional Gyro (heading indicator)', required: true },
      ],
    },
  },

  // Maintenance and Inspection Requirements
  INSPECTIONS: {
    // Annual Inspection (14 CFR 91.409)
    ANNUAL: {
      section: '14 CFR 91.409(a)',
      title: 'Annual inspection',
      interval: 12, // calendar months
      description: 'No person may operate an aircraft unless, within the preceding 12 calendar months, it has had an annual inspection and been approved for return to service',
      performedBy: 'IA (Inspection Authorization) holder or repair station',
    },

    // 100-Hour Inspection (14 CFR 91.409(b))
    HUNDRED_HOUR: {
      section: '14 CFR 91.409(b)',
      title: '100-hour inspection',
      interval: 100, // hours of time in service
      description: 'Required for aircraft carrying persons for hire or providing flight instruction for hire',
      allowance: 10, // hours overfly allowed to reach a place where inspection can be done
      performedBy: 'A&P mechanic, IA holder, or repair station',
    },

    // Progressive Inspection (14 CFR 91.409(d))
    PROGRESSIVE: {
      section: '14 CFR 91.409(d)',
      title: 'Progressive inspection',
      description: 'Alternative to annual/100-hour inspection approved by FAA FSDO',
    },

    // Transponder Check (14 CFR 91.413)
    TRANSPONDER: {
      section: '14 CFR 91.413',
      title: 'ATC transponder tests and inspections',
      interval: 24, // calendar months
      description: 'No person may use an ATC transponder unless, within the preceding 24 calendar months, the transponder has been tested and inspected',
    },

    // Altimeter and Pitot-Static System (14 CFR 91.411)
    ALTIMETER_STATIC: {
      section: '14 CFR 91.411',
      title: 'Altimeter system and altitude reporting equipment tests and inspections',
      interval: 24, // calendar months
      description: 'Required for IFR operations within controlled airspace',
      includes: ['Altimeter', 'Static pressure system', 'Automatic pressure altitude reporting system'],
    },

    // VOR Equipment Check (14 CFR 91.171)
    VOR: {
      section: '14 CFR 91.171',
      title: 'VOR equipment check for IFR operations',
      interval: 30, // days
      description: 'No person may operate a civil aircraft under IFR using VOR unless the VOR equipment has been operationally checked within the preceding 30 days',
      checkMethods: [
        'VOT (Voice of Test) facility: +/- 4 degrees',
        'Ground VOR checkpoint: +/- 4 degrees',
        'Airborne VOR checkpoint: +/- 6 degrees',
        'Dual VOR cross-check: within 4 degrees of each other',
      ],
    },

    // ELT (14 CFR 91.207)
    ELT: {
      section: '14 CFR 91.207',
      title: 'Emergency locator transmitters',
      inspectionInterval: 12, // calendar months
      batteryReplacement: {
        useLifeExpired: true,
        cumulativeUseHours: 1, // after 1 hour cumulative use
        description: 'Replace when 50% of battery useful life has expired or after 1 hour cumulative use',
      },
      description: 'ELT must be inspected within 12 calendar months after the last inspection for proper installation, battery corrosion, operation of controls and crash sensor, and sufficient signal radiated from its antenna',
    },

    // ADs (14 CFR 91.403(a) & 39.x)
    AIRWORTHINESS_DIRECTIVES: {
      section: '14 CFR 39 / 91.403(a)',
      title: 'Airworthiness Directives',
      description: 'Legally enforceable rules issued by the FAA to correct unsafe conditions in aircraft, engines, propellers, or appliances',
      compliance: 'Mandatory - aircraft not airworthy if non-compliant with applicable ADs',
      types: [
        'Emergency AD - immediate compliance required',
        'Standard AD - compliance within specified timeframe',
        'Repetitive AD - recurring inspections or actions at specified intervals',
      ],
    },
  },

  // Airworthiness Requirements
  AIRWORTHINESS: {
    // What makes an aircraft airworthy (14 CFR 91.403)
    RESPONSIBILITY: {
      section: '14 CFR 91.403',
      title: 'General maintenance requirements',
      description: 'Owner/operator responsible for maintaining aircraft in airworthy condition, including compliance with ADs and Part 43 maintenance records',
    },

    // Required documents on board (14 CFR 91.203) - "ARROW"
    REQUIRED_DOCUMENTS: {
      section: '14 CFR 91.203',
      title: 'Civil aircraft: Certifications required',
      mnemonic: 'ARROW',
      items: [
        { code: 'A', item: 'Airworthiness Certificate', description: 'Must be displayed in aircraft where visible to passengers/crew' },
        { code: 'R', item: 'Registration Certificate', description: 'Must be carried in aircraft at all times' },
        { code: 'R', item: 'Radio Station License', description: 'Required for international flights (FCC license)' },
        { code: 'O', item: 'Operating Limitations (POH/AFM)', description: 'Must be in the aircraft - placard, manual, or markings' },
        { code: 'W', item: 'Weight & Balance data', description: 'Current weight and balance information' },
      ],
    },

    // Inoperative Equipment (14 CFR 91.213)
    INOPERATIVE_EQUIPMENT: {
      section: '14 CFR 91.213',
      title: 'Inoperative instruments and equipment',
      decisionProcess: [
        '1. Is the item on the MEL (Minimum Equipment List)? If so, follow MEL procedures.',
        '2. Is the item required by the aircraft KOEL (Kinds of Operations Equipment List)?',
        '3. Is the item required by 14 CFR 91.205 for the type of flight operation?',
        '4. Is the item required by any AD (Airworthiness Directive)?',
        '5. If not required by any of the above, it can be deactivated/removed and placarded INOPERATIVE.',
      ],
    },
  },

  // Flight Rules
  FLIGHT_RULES: {
    // VFR Weather Minimums (14 CFR 91.155)
    VFR_WEATHER_MINIMUMS: {
      section: '14 CFR 91.155',
      title: 'Basic VFR weather minimums',
      airspace: {
        CLASS_B: {
          visibility: 3,     // statute miles
          cloudClearance: 'Clear of clouds',
        },
        CLASS_C: {
          visibility: 3,
          cloudClearance: '500 below, 1000 above, 2000 horizontal',
        },
        CLASS_D: {
          visibility: 3,
          cloudClearance: '500 below, 1000 above, 2000 horizontal',
        },
        CLASS_E_BELOW_10000: {
          visibility: 3,
          cloudClearance: '500 below, 1000 above, 2000 horizontal',
        },
        CLASS_E_AT_OR_ABOVE_10000: {
          visibility: 5,
          cloudClearance: '1000 below, 1000 above, 1 SM horizontal',
        },
        CLASS_G_DAY_BELOW_1200: {
          visibility: 1,
          cloudClearance: 'Clear of clouds',
        },
        CLASS_G_NIGHT_BELOW_1200: {
          visibility: 3,
          cloudClearance: '500 below, 1000 above, 2000 horizontal',
        },
      },
    },

    // Special VFR (14 CFR 91.157)
    SPECIAL_VFR: {
      section: '14 CFR 91.157',
      title: 'Special VFR weather minimums',
      requirements: {
        visibility: 1,  // SM ground visibility
        clearOfClouds: true,
        atcClearance: true,
        nightRequiresInstrumentRating: true,
      },
    },

    // IFR Alternate Requirements (14 CFR 91.169)
    IFR_ALTERNATE: {
      section: '14 CFR 91.169',
      title: 'IFR flight plan: Information required',
      alternateRequired: '1-2-3 rule: If weather at destination from 1 hour before to 1 hour after ETA is below 2,000 ceiling and 3 SM visibility, an alternate is required',
    },

    // Fuel Requirements (14 CFR 91.151 & 91.167)
    FUEL_REQUIREMENTS: {
      VFR_DAY: {
        section: '14 CFR 91.151',
        reserve: 30, // minutes at normal cruise
        description: 'Enough fuel to fly to first point of intended landing and, assuming normal cruising speed, to fly after that for at least 30 minutes',
      },
      VFR_NIGHT: {
        section: '14 CFR 91.151',
        reserve: 45, // minutes at normal cruise
        description: 'Same as VFR day but with 45 minutes reserve',
      },
      IFR: {
        section: '14 CFR 91.167',
        reserve: 45, // minutes at normal cruise
        description: 'Enough fuel to complete flight to first airport of intended landing, fly to alternate (if required), and fly for 45 minutes at normal cruise after that',
      },
    },

    // Oxygen Requirements (14 CFR 91.211)
    OXYGEN: {
      section: '14 CFR 91.211',
      title: 'Supplemental oxygen',
      requirements: {
        crew_above_12500: 'Required crew oxygen above 12,500 feet MSL cabin pressure altitude (after 30 min)',
        crew_above_14000: 'Required crew oxygen above 14,000 feet MSL cabin pressure altitude (at all times)',
        pax_above_15000: 'Must provide oxygen to each occupant above 15,000 feet MSL cabin pressure altitude',
      },
    },
  },

  // Preventive Maintenance (14 CFR 91.403 + Part 43 Appendix A)
  PREVENTIVE_MAINTENANCE: {
    section: '14 CFR 43 Appendix A(c)',
    title: 'Preventive maintenance items a pilot may perform',
    description: 'A certificated pilot may perform preventive maintenance on an aircraft owned or operated by that pilot, not used for air carrier operations',
    items: [
      'Replenishing hydraulic fluid',
      'Replacing safety belts',
      'Replacing bulbs, reflectors, lenses in position/landing lights',
      'Replacing wheels and skis where no weight & balance computation required',
      'Replacing prefabricated fuel lines',
      'Cleaning/replacing spark plugs and setting gap',
      'Replacing/servicing batteries',
      'Replacing/adjusting non-structural fasteners',
      'Tire replacement and servicing',
      'Lubricating as per instructions',
    ],
  },
} as const;

// ============================================
// 14 CFR PART 43 - MAINTENANCE, PREVENTIVE MAINTENANCE, REBUILDING, AND ALTERATION
// ============================================

export const FAR_PART_43 = {
  // Maintenance Records (14 CFR 43.9 & 43.11)
  MAINTENANCE_RECORDS: {
    CONTENT: {
      section: '14 CFR 43.9',
      title: 'Content, form, and disposition of maintenance records',
      requiredEntries: [
        'Description of work performed',
        'Date of completion',
        'Name of person performing the work',
        'Signature, certificate number, and kind of certificate held',
        'If the work was performed satisfactorily or not',
      ],
    },
    INSPECTIONS: {
      section: '14 CFR 43.11',
      title: 'Content, form, and disposition of records for inspections',
      requiredEntries: [
        'Type of inspection and a brief description',
        'Date of inspection and aircraft total time in service',
        'Signature, certificate number, and kind of certificate held',
        'A statement that the aircraft was found airworthy (or list of discrepancies)',
      ],
    },
  },
} as const;

// ============================================
// 14 CFR PART 107 - SMALL UNMANNED AIRCRAFT SYSTEMS (drones)
// ============================================

export const FAR_PART_107 = {
  section: '14 CFR Part 107',
  title: 'Small Unmanned Aircraft Systems',
  REMOTE_PILOT_CERTIFICATE: {
    section: '14 CFR 107.12',
    title: 'Requirement for a remote pilot certificate with a small UAS rating',
    recurrency: 24, // months - knowledge test or training every 24 months
  },
} as const;

// ============================================
// NTSB Part 830 - Accident/Incident Reporting
// ============================================

export const NTSB_PART_830 = {
  section: '49 CFR 830',
  title: 'Notification and Reporting of Aircraft Accidents or Incidents',
  IMMEDIATE_NOTIFICATION: {
    section: '49 CFR 830.5',
    title: 'Immediate notification',
    reportTo: 'NTSB (National Transportation Safety Board)',
    events: [
      'Flight control system malfunction or failure',
      'Inability of any required flight crewmember to perform normal duties due to injury or illness',
      'Failure of structural components of a turbine engine excluding compressor and turbine blades/vanes',
      'In-flight fire',
      'Aircraft collision in flight',
      'Damage to property (other than the aircraft) exceeding $25,000',
      'Release of all or a portion of a propeller blade from an aircraft',
      'Complete loss of information from more than 50% of EFIS displays',
      'ACAS resolution advisories during IFR operations',
      'Aircraft operated on the ground, on water, or in the air, involved in an accident',
    ],
  },
} as const;

// ============================================
// HELPER: Quick lookup for regulation references used in legality checks
// ============================================

export const REGULATION_REFS = {
  // Aircraft Maintenance
  ANNUAL_INSPECTION: '14 CFR 91.409(a)',
  HUNDRED_HOUR_INSPECTION: '14 CFR 91.409(b)',
  PROGRESSIVE_INSPECTION: '14 CFR 91.409(d)',
  TRANSPONDER_CHECK: '14 CFR 91.413',
  ALTIMETER_STATIC_CHECK: '14 CFR 91.411',
  VOR_CHECK: '14 CFR 91.171',
  ELT_INSPECTION: '14 CFR 91.207',
  AD_COMPLIANCE: '14 CFR 39 / 91.403(a)',
  REQUIRED_INSTRUMENTS_VFR_DAY: '14 CFR 91.205(b)',
  REQUIRED_INSTRUMENTS_VFR_NIGHT: '14 CFR 91.205(c)',
  REQUIRED_INSTRUMENTS_IFR: '14 CFR 91.205(d)',
  INOPERATIVE_EQUIPMENT: '14 CFR 91.213',
  AIRCRAFT_DOCUMENTS: '14 CFR 91.203',
  MAINTENANCE_RESPONSIBILITY: '14 CFR 91.403',

  // Pilot Currency
  MEDICAL_CERTIFICATE: '14 CFR 61.23',
  FLIGHT_REVIEW: '14 CFR 61.56',
  DAY_LANDING_CURRENCY: '14 CFR 61.57(a)',
  NIGHT_LANDING_CURRENCY: '14 CFR 61.57(b)',
  IFR_CURRENCY: '14 CFR 61.57(c)',

  // Endorsements
  HIGH_PERFORMANCE: '14 CFR 61.31(f)',
  COMPLEX_AIRCRAFT: '14 CFR 61.31(e)',
  HIGH_ALTITUDE: '14 CFR 61.31(g)',
  TAILWHEEL: '14 CFR 61.31(i)',

  // Flight Rules
  VFR_MINIMUMS: '14 CFR 91.155',
  SPECIAL_VFR: '14 CFR 91.157',
  VFR_FUEL_RESERVE: '14 CFR 91.151',
  IFR_FUEL_RESERVE: '14 CFR 91.167',
  IFR_ALTERNATE: '14 CFR 91.169',
  SUPPLEMENTAL_OXYGEN: '14 CFR 91.211',

  // Airworthiness
  AIRWORTHINESS_DIRECTIVES: '14 CFR Part 39',
  PREVENTIVE_MAINTENANCE: '14 CFR 43 Appendix A(c)',
  MAINTENANCE_RECORDS: '14 CFR 43.9',
  INSPECTION_RECORDS: '14 CFR 43.11',
} as const;

// Type for regulation reference keys
export type RegulationRefKey = keyof typeof REGULATION_REFS;
