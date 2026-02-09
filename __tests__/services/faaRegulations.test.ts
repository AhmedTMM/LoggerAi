import { describe, it, expect } from 'vitest';
import {
  FAR_PART_61,
  FAR_PART_91,
  FAR_PART_43,
  NTSB_PART_830,
  REGULATION_REFS,
} from '@/lib/faaRegulations';

// =============================================================================
// FAR PART 61 - Pilots, Flight Instructors, Ground Instructors
// =============================================================================

describe('FAR_PART_61', () => {
  describe('CERTIFICATE_TYPES (14 CFR 61.5)', () => {
    it('has a section reference', () => {
      expect(FAR_PART_61.CERTIFICATE_TYPES.section).toBe('14 CFR 61.5');
    });

    it('has a title', () => {
      expect(FAR_PART_61.CERTIFICATE_TYPES.title).toBeTruthy();
    });

    it('includes all standard certificate types', () => {
      const types = FAR_PART_61.CERTIFICATE_TYPES.types;
      expect(types).toContain('Student Pilot');
      expect(types).toContain('Private Pilot (PPL)');
      expect(types).toContain('Commercial Pilot (CPL)');
      expect(types).toContain('Airline Transport Pilot (ATP)');
      expect(types).toContain('Sport Pilot');
      expect(types).toContain('Flight Instructor (CFI)');
      expect(types).toContain('Flight Instructor - Instrument (CFII)');
    });

    it('has at least 7 certificate types', () => {
      expect(FAR_PART_61.CERTIFICATE_TYPES.types.length).toBeGreaterThanOrEqual(7);
    });
  });

  describe('MEDICAL (14 CFR 61.23)', () => {
    it('references 14 CFR 61.23', () => {
      expect(FAR_PART_61.MEDICAL.section).toBe('14 CFR 61.23');
    });

    it('has a title', () => {
      expect(FAR_PART_61.MEDICAL.title).toBe('Medical certificates: Requirement and duration');
    });

    describe('First Class medical', () => {
      const first = FAR_PART_61.MEDICAL.classes.FIRST_CLASS;

      it('references 14 CFR 61.23(d)(1)', () => {
        expect(first.section).toBe('14 CFR 61.23(d)(1)');
      });

      it('is required for ATP privileges', () => {
        expect(first.requiredFor).toContain('ATP');
      });

      it('has duration of 12 months under 40', () => {
        expect(first.duration.under40).toBe(12);
      });

      it('has duration of 6 months over 40', () => {
        expect(first.duration.over40).toBe(6);
      });
    });

    describe('Second Class medical', () => {
      const second = FAR_PART_61.MEDICAL.classes.SECOND_CLASS;

      it('references 14 CFR 61.23(d)(2)', () => {
        expect(second.section).toBe('14 CFR 61.23(d)(2)');
      });

      it('is required for commercial pilot privileges', () => {
        expect(second.requiredFor.toLowerCase()).toContain('commercial');
      });

      it('has uniform 12-month duration', () => {
        expect(second.duration).toBe(12);
      });
    });

    describe('Third Class medical', () => {
      const third = FAR_PART_61.MEDICAL.classes.THIRD_CLASS;

      it('references 14 CFR 61.23(d)(3)', () => {
        expect(third.section).toBe('14 CFR 61.23(d)(3)');
      });

      it('has duration of 60 months under 40', () => {
        expect(third.duration.under40).toBe(60);
      });

      it('has duration of 24 months over 40', () => {
        expect(third.duration.over40).toBe(24);
      });
    });

    describe('BasicMed', () => {
      const basicMed = FAR_PART_61.MEDICAL.classes.BASICMED;

      it('references 14 CFR 61.23(c)(3)', () => {
        expect(basicMed.section).toBe('14 CFR 61.23(c)(3)');
      });

      it('has a 48-month renewal period', () => {
        expect(basicMed.renewalPeriod).toBe(48);
      });

      it('requires online course', () => {
        expect(basicMed.onlineCourseRequired).toBe(true);
      });

      it('lists operational limitations', () => {
        expect(basicMed.limitations.length).toBeGreaterThanOrEqual(3);
        // Max 6 seats
        expect(basicMed.limitations.some(l => l.includes('6 seats'))).toBe(true);
        // Max 6,000 lbs
        expect(basicMed.limitations.some(l => l.includes('6,000'))).toBe(true);
        // Below 18,000 feet
        expect(basicMed.limitations.some(l => l.includes('18,000'))).toBe(true);
      });
    });
  });

  describe('FLIGHT_REVIEW (14 CFR 61.56)', () => {
    it('references 14 CFR 61.56', () => {
      expect(FAR_PART_61.FLIGHT_REVIEW.section).toBe('14 CFR 61.56');
    });

    it('has 24-month frequency', () => {
      expect(FAR_PART_61.FLIGHT_REVIEW.requirements.frequency).toBe(24);
    });

    it('requires minimum 1 hour of flight training', () => {
      expect(FAR_PART_61.FLIGHT_REVIEW.requirements.minimumFlightTime).toBe(1);
    });

    it('requires minimum 1 hour of ground training', () => {
      expect(FAR_PART_61.FLIGHT_REVIEW.requirements.minimumGroundTime).toBe(1);
    });

    it('lists WINGS program as an alternative', () => {
      const alts = FAR_PART_61.FLIGHT_REVIEW.alternatives;
      expect(alts.some(a => a.includes('WINGS'))).toBe(true);
    });
  });

  describe('CURRENCY (14 CFR 61.57)', () => {
    it('references 14 CFR 61.57', () => {
      expect(FAR_PART_61.CURRENCY.section).toBe('14 CFR 61.57');
    });

    describe('DAY_CURRENCY (14 CFR 61.57(a))', () => {
      const day = FAR_PART_61.CURRENCY.DAY_CURRENCY;

      it('references 14 CFR 61.57(a)', () => {
        expect(day.section).toBe('14 CFR 61.57(a)');
      });

      it('requires 3 landings', () => {
        expect(day.requirements.landings).toBe(3);
      });

      it('within 90-day period', () => {
        expect(day.requirements.period).toBe(90);
      });

      it('requires same category and class', () => {
        expect(day.requirements.sameCategory).toBe(true);
      });
    });

    describe('NIGHT_CURRENCY (14 CFR 61.57(b))', () => {
      const night = FAR_PART_61.CURRENCY.NIGHT_CURRENCY;

      it('references 14 CFR 61.57(b)', () => {
        expect(night.section).toBe('14 CFR 61.57(b)');
      });

      it('requires 3 full-stop landings', () => {
        expect(night.requirements.landings).toBe(3);
        expect(night.requirements.landingType).toBe('full-stop');
      });

      it('within 90-day period', () => {
        expect(night.requirements.period).toBe(90);
      });

      it('defines night as 1 hour after sunset to 1 hour before sunrise', () => {
        expect(night.requirements.timeFrame).toContain('1 hour after sunset');
      });
    });

    describe('IFR_CURRENCY (14 CFR 61.57(c))', () => {
      const ifr = FAR_PART_61.CURRENCY.IFR_CURRENCY;

      it('references 14 CFR 61.57(c)', () => {
        expect(ifr.section).toBe('14 CFR 61.57(c)');
      });

      it('requires 6 approaches in 6 months', () => {
        expect(ifr.requirements.approaches).toBe(6);
        expect(ifr.requirements.period).toBe(6);
      });

      it('requires holding procedures', () => {
        expect(ifr.requirements.holdingProcedures).toBe(true);
      });

      it('requires intercepting and tracking', () => {
        expect(ifr.requirements.interceptingTracking).toBe(true);
      });

      it('has a 6-month grace period (total 12 months before IPC required)', () => {
        expect(ifr.gracePeriod.totalMonths).toBe(12);
      });
    });
  });

  describe('ENDORSEMENTS', () => {
    it('has high performance endorsement referencing 14 CFR 61.31(f)', () => {
      expect(FAR_PART_61.ENDORSEMENTS.HIGH_PERFORMANCE.section).toBe('14 CFR 61.31(f)');
    });

    it('has complex endorsement referencing 14 CFR 61.31(e)', () => {
      expect(FAR_PART_61.ENDORSEMENTS.COMPLEX.section).toBe('14 CFR 61.31(e)');
    });

    it('has tailwheel endorsement referencing 14 CFR 61.31(i)', () => {
      expect(FAR_PART_61.ENDORSEMENTS.TAILWHEEL.section).toBe('14 CFR 61.31(i)');
    });

    it('has high altitude endorsement referencing 14 CFR 61.31(g)', () => {
      expect(FAR_PART_61.ENDORSEMENTS.HIGH_ALTITUDE.section).toBe('14 CFR 61.31(g)');
    });

    it('each endorsement has title and description', () => {
      const endorsements = Object.values(FAR_PART_61.ENDORSEMENTS);
      for (const endorsement of endorsements) {
        expect(endorsement.title).toBeTruthy();
        expect(endorsement.description).toBeTruthy();
        expect(endorsement.section).toBeTruthy();
      }
    });
  });

  describe('CATEGORY_CLASS_RATINGS', () => {
    it('includes ASEL', () => {
      expect(FAR_PART_61.CATEGORY_CLASS_RATINGS.categories).toContain(
        'Airplane Single-Engine Land (ASEL)'
      );
    });

    it('includes AMEL', () => {
      expect(FAR_PART_61.CATEGORY_CLASS_RATINGS.categories).toContain(
        'Airplane Multi-Engine Land (AMEL)'
      );
    });

    it('includes at least 10 category/class combinations', () => {
      expect(FAR_PART_61.CATEGORY_CLASS_RATINGS.categories.length).toBeGreaterThanOrEqual(10);
    });
  });

  describe('SPORT_PILOT', () => {
    it('lists light-sport aircraft limitation', () => {
      expect(FAR_PART_61.SPORT_PILOT.limitations.some(l => l.includes('Light-sport'))).toBe(true);
    });

    it('limits to daytime VFR', () => {
      expect(FAR_PART_61.SPORT_PILOT.limitations.some(l => l.includes('Daytime VFR'))).toBe(true);
    });
  });
});

// =============================================================================
// FAR PART 91 - General Operating and Flight Rules
// =============================================================================

describe('FAR_PART_91', () => {
  describe('INSPECTIONS', () => {
    describe('ANNUAL (14 CFR 91.409(a))', () => {
      const annual = FAR_PART_91.INSPECTIONS.ANNUAL;

      it('references 14 CFR 91.409(a)', () => {
        expect(annual.section).toBe('14 CFR 91.409(a)');
      });

      it('has 12-month interval', () => {
        expect(annual.interval).toBe(12);
      });

      it('has title and description', () => {
        expect(annual.title).toBeTruthy();
        expect(annual.description).toBeTruthy();
      });

      it('specifies performed by IA holder or repair station', () => {
        expect(annual.performedBy).toContain('IA');
      });
    });

    describe('HUNDRED_HOUR (14 CFR 91.409(b))', () => {
      const hundredHour = FAR_PART_91.INSPECTIONS.HUNDRED_HOUR;

      it('references 14 CFR 91.409(b)', () => {
        expect(hundredHour.section).toBe('14 CFR 91.409(b)');
      });

      it('has 100-hour interval', () => {
        expect(hundredHour.interval).toBe(100);
      });

      it('allows 10-hour overfly', () => {
        expect(hundredHour.allowance).toBe(10);
      });
    });

    describe('TRANSPONDER (14 CFR 91.413)', () => {
      const transponder = FAR_PART_91.INSPECTIONS.TRANSPONDER;

      it('references 14 CFR 91.413', () => {
        expect(transponder.section).toBe('14 CFR 91.413');
      });

      it('has 24-month interval', () => {
        expect(transponder.interval).toBe(24);
      });
    });

    describe('ALTIMETER_STATIC (14 CFR 91.411)', () => {
      const altimeter = FAR_PART_91.INSPECTIONS.ALTIMETER_STATIC;

      it('references 14 CFR 91.411', () => {
        expect(altimeter.section).toBe('14 CFR 91.411');
      });

      it('has 24-month interval', () => {
        expect(altimeter.interval).toBe(24);
      });

      it('is required for IFR operations', () => {
        expect(altimeter.description.toLowerCase()).toContain('ifr');
      });

      it('includes altimeter, static system, and altitude reporting', () => {
        expect(altimeter.includes).toContain('Altimeter');
        expect(altimeter.includes).toContain('Static pressure system');
      });
    });

    describe('ELT (14 CFR 91.207)', () => {
      const elt = FAR_PART_91.INSPECTIONS.ELT;

      it('references 14 CFR 91.207', () => {
        expect(elt.section).toBe('14 CFR 91.207');
      });

      it('has 12-month inspection interval', () => {
        expect(elt.inspectionInterval).toBe(12);
      });

      it('specifies battery replacement after 1 hour cumulative use', () => {
        expect(elt.batteryReplacement.cumulativeUseHours).toBe(1);
      });
    });

    describe('VOR (14 CFR 91.171)', () => {
      const vor = FAR_PART_91.INSPECTIONS.VOR;

      it('references 14 CFR 91.171', () => {
        expect(vor.section).toBe('14 CFR 91.171');
      });

      it('has 30-day interval', () => {
        expect(vor.interval).toBe(30);
      });

      it('lists at least 4 check methods', () => {
        expect(vor.checkMethods.length).toBeGreaterThanOrEqual(4);
      });

      it('includes VOT method', () => {
        expect(vor.checkMethods.some(m => m.includes('VOT'))).toBe(true);
      });
    });

    describe('AIRWORTHINESS_DIRECTIVES', () => {
      const ads = FAR_PART_91.INSPECTIONS.AIRWORTHINESS_DIRECTIVES;

      it('references 14 CFR 39 / 91.403(a)', () => {
        expect(ads.section).toContain('39');
      });

      it('compliance is mandatory', () => {
        expect(ads.compliance.toLowerCase()).toContain('mandatory');
      });

      it('lists emergency, standard, and repetitive AD types', () => {
        expect(ads.types.some(t => t.includes('Emergency'))).toBe(true);
        expect(ads.types.some(t => t.includes('Standard'))).toBe(true);
        expect(ads.types.some(t => t.includes('Repetitive'))).toBe(true);
      });
    });
  });

  describe('REQUIRED_INSTRUMENTS', () => {
    it('references 14 CFR 91.205', () => {
      expect(FAR_PART_91.REQUIRED_INSTRUMENTS.section).toBe('14 CFR 91.205');
    });

    it('VFR day items use A-TOMATO-FLAMES mnemonic', () => {
      expect(FAR_PART_91.REQUIRED_INSTRUMENTS.VFR_DAY.mnemonic).toBe('A-TOMATO-FLAMES');
    });

    it('VFR day has 13 required items', () => {
      expect(FAR_PART_91.REQUIRED_INSTRUMENTS.VFR_DAY.items.length).toBe(13);
    });

    it('all VFR day items are required', () => {
      for (const item of FAR_PART_91.REQUIRED_INSTRUMENTS.VFR_DAY.items) {
        expect(item.required).toBe(true);
      }
    });

    it('VFR night adds FLAPS items', () => {
      expect(FAR_PART_91.REQUIRED_INSTRUMENTS.VFR_NIGHT.additionalItems.length).toBe(5);
    });

    it('IFR adds GRABCARD items', () => {
      expect(FAR_PART_91.REQUIRED_INSTRUMENTS.IFR.additionalItems.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('AIRWORTHINESS.REQUIRED_DOCUMENTS', () => {
    it('uses the ARROW mnemonic', () => {
      expect(FAR_PART_91.AIRWORTHINESS.REQUIRED_DOCUMENTS.mnemonic).toBe('ARROW');
    });

    it('lists 5 required documents', () => {
      expect(FAR_PART_91.AIRWORTHINESS.REQUIRED_DOCUMENTS.items.length).toBe(5);
    });

    it('includes Airworthiness Certificate', () => {
      expect(
        FAR_PART_91.AIRWORTHINESS.REQUIRED_DOCUMENTS.items.some(i => i.item === 'Airworthiness Certificate')
      ).toBe(true);
    });
  });

  describe('FLIGHT_RULES', () => {
    describe('VFR_WEATHER_MINIMUMS (14 CFR 91.155)', () => {
      const mins = FAR_PART_91.FLIGHT_RULES.VFR_WEATHER_MINIMUMS;

      it('references 14 CFR 91.155', () => {
        expect(mins.section).toBe('14 CFR 91.155');
      });

      it('Class B requires 3SM visibility and clear of clouds', () => {
        expect(mins.airspace.CLASS_B.visibility).toBe(3);
        expect(mins.airspace.CLASS_B.cloudClearance).toBe('Clear of clouds');
      });

      it('Class E at/above 10,000 requires 5SM visibility', () => {
        expect(mins.airspace.CLASS_E_AT_OR_ABOVE_10000.visibility).toBe(5);
      });

      it('Class G day below 1200 requires only 1SM visibility', () => {
        expect(mins.airspace.CLASS_G_DAY_BELOW_1200.visibility).toBe(1);
      });
    });

    describe('FUEL_REQUIREMENTS', () => {
      it('VFR day reserve is 30 minutes', () => {
        expect(FAR_PART_91.FLIGHT_RULES.FUEL_REQUIREMENTS.VFR_DAY.reserve).toBe(30);
      });

      it('VFR night reserve is 45 minutes', () => {
        expect(FAR_PART_91.FLIGHT_RULES.FUEL_REQUIREMENTS.VFR_NIGHT.reserve).toBe(45);
      });

      it('IFR reserve is 45 minutes', () => {
        expect(FAR_PART_91.FLIGHT_RULES.FUEL_REQUIREMENTS.IFR.reserve).toBe(45);
      });
    });

    describe('OXYGEN (14 CFR 91.211)', () => {
      it('references 14 CFR 91.211', () => {
        expect(FAR_PART_91.FLIGHT_RULES.OXYGEN.section).toBe('14 CFR 91.211');
      });

      it('defines crew requirements above 12,500 and 14,000 feet', () => {
        expect(FAR_PART_91.FLIGHT_RULES.OXYGEN.requirements.crew_above_12500).toBeTruthy();
        expect(FAR_PART_91.FLIGHT_RULES.OXYGEN.requirements.crew_above_14000).toBeTruthy();
      });

      it('defines passenger requirements above 15,000 feet', () => {
        expect(FAR_PART_91.FLIGHT_RULES.OXYGEN.requirements.pax_above_15000).toBeTruthy();
      });
    });
  });

  describe('PREVENTIVE_MAINTENANCE', () => {
    it('references Part 43 Appendix A(c)', () => {
      expect(FAR_PART_91.PREVENTIVE_MAINTENANCE.section).toContain('43 Appendix A(c)');
    });

    it('lists at least 8 preventive maintenance items', () => {
      expect(FAR_PART_91.PREVENTIVE_MAINTENANCE.items.length).toBeGreaterThanOrEqual(8);
    });

    it('includes tire replacement', () => {
      expect(FAR_PART_91.PREVENTIVE_MAINTENANCE.items.some(i => i.includes('Tire'))).toBe(true);
    });
  });
});

// =============================================================================
// FAR PART 43 - Maintenance Records
// =============================================================================

describe('FAR_PART_43', () => {
  describe('MAINTENANCE_RECORDS.CONTENT (14 CFR 43.9)', () => {
    it('references 14 CFR 43.9', () => {
      expect(FAR_PART_43.MAINTENANCE_RECORDS.CONTENT.section).toBe('14 CFR 43.9');
    });

    it('lists required entries', () => {
      expect(FAR_PART_43.MAINTENANCE_RECORDS.CONTENT.requiredEntries.length).toBeGreaterThanOrEqual(4);
    });

    it('requires description of work, date, name, and signature', () => {
      const entries = FAR_PART_43.MAINTENANCE_RECORDS.CONTENT.requiredEntries;
      expect(entries.some(e => e.toLowerCase().includes('description'))).toBe(true);
      expect(entries.some(e => e.toLowerCase().includes('date'))).toBe(true);
      expect(entries.some(e => e.toLowerCase().includes('name'))).toBe(true);
      expect(entries.some(e => e.toLowerCase().includes('signature'))).toBe(true);
    });
  });

  describe('MAINTENANCE_RECORDS.INSPECTIONS (14 CFR 43.11)', () => {
    it('references 14 CFR 43.11', () => {
      expect(FAR_PART_43.MAINTENANCE_RECORDS.INSPECTIONS.section).toBe('14 CFR 43.11');
    });

    it('lists required entries for inspections', () => {
      expect(FAR_PART_43.MAINTENANCE_RECORDS.INSPECTIONS.requiredEntries.length).toBeGreaterThanOrEqual(3);
    });
  });
});

// =============================================================================
// NTSB Part 830
// =============================================================================

describe('NTSB_PART_830', () => {
  it('references 49 CFR 830', () => {
    expect(NTSB_PART_830.section).toBe('49 CFR 830');
  });

  it('IMMEDIATE_NOTIFICATION references 49 CFR 830.5', () => {
    expect(NTSB_PART_830.IMMEDIATE_NOTIFICATION.section).toBe('49 CFR 830.5');
  });

  it('reports to NTSB', () => {
    expect(NTSB_PART_830.IMMEDIATE_NOTIFICATION.reportTo).toContain('NTSB');
  });

  it('lists at least 8 events requiring immediate notification', () => {
    expect(NTSB_PART_830.IMMEDIATE_NOTIFICATION.events.length).toBeGreaterThanOrEqual(8);
  });

  it('includes in-flight fire as a notifiable event', () => {
    expect(NTSB_PART_830.IMMEDIATE_NOTIFICATION.events.some(e => e.includes('fire'))).toBe(true);
  });
});

// =============================================================================
// REGULATION_REFS - Quick lookup mapping
// =============================================================================

describe('REGULATION_REFS', () => {
  it('has all aircraft maintenance references', () => {
    expect(REGULATION_REFS.ANNUAL_INSPECTION).toBe('14 CFR 91.409(a)');
    expect(REGULATION_REFS.HUNDRED_HOUR_INSPECTION).toBe('14 CFR 91.409(b)');
    expect(REGULATION_REFS.TRANSPONDER_CHECK).toBe('14 CFR 91.413');
    expect(REGULATION_REFS.ALTIMETER_STATIC_CHECK).toBe('14 CFR 91.411');
    expect(REGULATION_REFS.VOR_CHECK).toBe('14 CFR 91.171');
    expect(REGULATION_REFS.ELT_INSPECTION).toBe('14 CFR 91.207');
    expect(REGULATION_REFS.AD_COMPLIANCE).toBe('14 CFR 39 / 91.403(a)');
  });

  it('has all pilot currency references', () => {
    expect(REGULATION_REFS.MEDICAL_CERTIFICATE).toBe('14 CFR 61.23');
    expect(REGULATION_REFS.FLIGHT_REVIEW).toBe('14 CFR 61.56');
    expect(REGULATION_REFS.DAY_LANDING_CURRENCY).toBe('14 CFR 61.57(a)');
    expect(REGULATION_REFS.NIGHT_LANDING_CURRENCY).toBe('14 CFR 61.57(b)');
    expect(REGULATION_REFS.IFR_CURRENCY).toBe('14 CFR 61.57(c)');
  });

  it('has all endorsement references', () => {
    expect(REGULATION_REFS.HIGH_PERFORMANCE).toBe('14 CFR 61.31(f)');
    expect(REGULATION_REFS.COMPLEX_AIRCRAFT).toBe('14 CFR 61.31(e)');
    expect(REGULATION_REFS.HIGH_ALTITUDE).toBe('14 CFR 61.31(g)');
    expect(REGULATION_REFS.TAILWHEEL).toBe('14 CFR 61.31(i)');
  });

  it('has all flight rule references', () => {
    expect(REGULATION_REFS.VFR_MINIMUMS).toBe('14 CFR 91.155');
    expect(REGULATION_REFS.SPECIAL_VFR).toBe('14 CFR 91.157');
    expect(REGULATION_REFS.VFR_FUEL_RESERVE).toBe('14 CFR 91.151');
    expect(REGULATION_REFS.IFR_FUEL_RESERVE).toBe('14 CFR 91.167');
    expect(REGULATION_REFS.IFR_ALTERNATE).toBe('14 CFR 91.169');
    expect(REGULATION_REFS.SUPPLEMENTAL_OXYGEN).toBe('14 CFR 91.211');
  });

  it('has all required instrument references', () => {
    expect(REGULATION_REFS.REQUIRED_INSTRUMENTS_VFR_DAY).toBe('14 CFR 91.205(b)');
    expect(REGULATION_REFS.REQUIRED_INSTRUMENTS_VFR_NIGHT).toBe('14 CFR 91.205(c)');
    expect(REGULATION_REFS.REQUIRED_INSTRUMENTS_IFR).toBe('14 CFR 91.205(d)');
  });

  it('has maintenance record references', () => {
    expect(REGULATION_REFS.MAINTENANCE_RECORDS).toBe('14 CFR 43.9');
    expect(REGULATION_REFS.INSPECTION_RECORDS).toBe('14 CFR 43.11');
  });

  it('references match the corresponding FAR constants', () => {
    // Verify the refs match what is actually in the FAR constant objects
    expect(REGULATION_REFS.ANNUAL_INSPECTION).toBe(FAR_PART_91.INSPECTIONS.ANNUAL.section);
    expect(REGULATION_REFS.TRANSPONDER_CHECK).toBe(FAR_PART_91.INSPECTIONS.TRANSPONDER.section);
    expect(REGULATION_REFS.ALTIMETER_STATIC_CHECK).toBe(FAR_PART_91.INSPECTIONS.ALTIMETER_STATIC.section);
    expect(REGULATION_REFS.VOR_CHECK).toBe(FAR_PART_91.INSPECTIONS.VOR.section);
    expect(REGULATION_REFS.ELT_INSPECTION).toBe(FAR_PART_91.INSPECTIONS.ELT.section);
    expect(REGULATION_REFS.MEDICAL_CERTIFICATE).toBe(FAR_PART_61.MEDICAL.section);
    expect(REGULATION_REFS.FLIGHT_REVIEW).toBe(FAR_PART_61.FLIGHT_REVIEW.section);
    expect(REGULATION_REFS.DAY_LANDING_CURRENCY).toBe(FAR_PART_61.CURRENCY.DAY_CURRENCY.section);
    expect(REGULATION_REFS.NIGHT_LANDING_CURRENCY).toBe(FAR_PART_61.CURRENCY.NIGHT_CURRENCY.section);
    expect(REGULATION_REFS.IFR_CURRENCY).toBe(FAR_PART_61.CURRENCY.IFR_CURRENCY.section);
  });

  it('every value is a non-empty string', () => {
    for (const [key, value] of Object.entries(REGULATION_REFS)) {
      expect(value).toBeTruthy();
      expect(typeof value).toBe('string');
      expect((value as string).length).toBeGreaterThan(0);
    }
  });
});
