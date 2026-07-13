/* ============================================================
   RWG CRM — Lead Quality Scoring Engine
   Encodes the owner's FRS lead-quality rules into an automatic
   tier (GOLD / HIGH / MEDIUM / LOW) + numeric score + reasons.
   All thresholds live in defaultConfig and are editable in Settings.
   ============================================================ */
window.RWG = window.RWG || {};
RWG.scoring = (function () {

  const defaultConfig = {
    // DROP eligibility requirements by member class
    drop: {
      regular:     { yos: 30, age: 62 },
      specialRisk: { yos: 25, age: 55 }
    },
    inServiceAge: 59.5,        // in-service rollover -> annuity
    nearDropYears: 5,          // "close to eligible" bonus window
    afc: { high: 100000, mid: 75000, low: 50000 },
    investmentHighYos: 20,     // Investment Plan tenure that implies a large account
    tierCutoffs: { gold: 72, high: 50, medium: 28 }
  };

  const tierMeta = {
    GOLD:   { label: 'GOLD',   cls: 'tier-gold',   dot: 'gold',   icon: '★' },
    HIGH:   { label: 'High',   cls: 'tier-high',   dot: 'high',   icon: '▲' },
    MEDIUM: { label: 'Medium', cls: 'tier-medium', dot: 'medium', icon: '●' },
    LOW:    { label: 'Low',    cls: 'tier-low',    dot: 'low',    icon: '○' }
  };

  function ageFromDOB(dob) {
    if (!dob) return null;
    const d = new Date(dob);
    if (isNaN(d)) return null;
    const ms = Date.now() - d.getTime();
    return +(ms / (365.25 * 24 * 3600 * 1000)).toFixed(1);
  }

  function resolveAge(lead) {
    if (lead.age != null && lead.age !== '') return Number(lead.age);
    return ageFromDOB(lead.dob);
  }

  function normPlan(p) {
    if (!p) return 'Unknown';
    const s = String(p).toLowerCase();
    if (s.includes('drop')) return 'DROP';
    if (s.includes('invest')) return 'Investment';
    if (s.includes('pension')) return 'Pension';
    return 'Unknown'; // "Don't Know"
  }

  const k = (n) => '$' + Math.round(n / 1000) + 'k';

  /**
   * scoreLead(lead, config?) -> { tier, score, reasons[], headline, dropEligible, inDrop }
   */
  function scoreLead(lead, config) {
    const cfg = Object.assign({}, defaultConfig, config || {});
    const age = resolveAge(lead);
    const yos = Number(lead.yos) || 0;
    const afc = Number(lead.afc) || 0;
    const plan = normPlan(lead.planType);
    const special = /special/i.test(lead.memberClass || '');
    const req = special ? cfg.drop.specialRisk : cfg.drop.regular;

    const inDrop = plan === 'DROP';
    const dropEligible = (yos >= req.yos) || (age != null && age >= req.age);

    // years until eligible (by either yos or age path), if not yet eligible
    let yearsToEligible = null;
    if (!dropEligible) {
      const byYos = req.yos - yos;
      const byAge = age != null ? req.age - age : Infinity;
      yearsToEligible = Math.max(0, Math.min(byYos, byAge));
      if (!isFinite(yearsToEligible)) yearsToEligible = null;
    }

    let score = 0;
    const reasons = [];   // ordered by importance (push most important first)
    let golden = false;

    // ── DROP status: the strongest signal ──
    if (inDrop) {
      score += 32;
      reasons.push('In DROP — lump-sum becomes investable AUM down the road');
    } else if (dropEligible) {
      score += 42;
      golden = true;
      reasons.push('DROP-eligible, not yet in DROP — PEN Max + high-premium life (GOLD)');
    } else if (yearsToEligible != null && yearsToEligible <= cfg.nearDropYears) {
      const prox = (cfg.nearDropYears - yearsToEligible) / cfg.nearDropYears;
      score += Math.round(8 + prox * 16);
      reasons.push(`~${yearsToEligible} yr from DROP eligibility — plan ahead now`);
    }

    // ── In-service rollover window ──
    if (age != null && age >= cfg.inServiceAge) {
      score += 24;
      reasons.push('Age 59½+ — in-service rollover to annuity (~6% commission)');
    }

    // ── Plan type ──
    if (plan === 'Investment') {
      score += 12;
      if (yos >= cfg.investmentHighYos) {
        score += 20;
        reasons.push('High-tenure Investment Plan — likely large account (~$500k potential)');
      } else {
        reasons.push('Investment Plan — needs active asset management');
      }
    } else if (plan === 'Pension') {
      if (yos < 10) {
        score -= 4;
        reasons.push('Early-career Pension — limited near-term fit');
      } else {
        reasons.push('Pension Plan — fit for PEN Max analysis');
      }
    } else if (plan === 'Unknown') {
      if (afc >= cfg.afc.mid && yos >= 15) {
        score += 15;
        reasons.push('Plan unknown but strong income & tenure — high upside');
      } else {
        reasons.push('Plan unknown — needs discovery call');
      }
    }

    // ── AFC / salary ──
    if (afc >= cfg.afc.high) {
      score += 16;
      reasons.push(`High AFC (${k(afc)}) — strong allocation capacity`);
    } else if (afc >= cfg.afc.mid) {
      score += 9;
      reasons.push(`Solid AFC (${k(afc)})`);
    } else if (afc >= cfg.afc.low) {
      score += 3;
    } else if (afc > 0 && !golden) {
      reasons.push('Lower AFC — confirm cashflow before investing time');
    }

    // ── Tenure value (general) ──
    score += Math.min(yos, 35) * 0.4;

    // ── Warm lead: attended the seminar ──
    if (/^y/i.test(lead.attended || '')) {
      score += 6;
      reasons.push('Attended the seminar — warmer lead');
    }

    score = Math.max(0, Math.min(100, Math.round(score)));

    let tier;
    const c = cfg.tierCutoffs;
    if (golden || score >= c.gold) tier = 'GOLD';
    else if (score >= c.high) tier = 'HIGH';
    else if (score >= c.medium) tier = 'MEDIUM';
    else tier = 'LOW';

    return {
      tier,
      score,
      reasons,
      headline: reasons[0] || 'Standard profile',
      dropEligible,
      inDrop,
      yearsToEligible
    };
  }

  return { scoreLead, defaultConfig, tierMeta, normPlan, resolveAge };
})();
