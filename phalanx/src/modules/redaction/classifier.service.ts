import { Injectable } from '@nitrostack/core';

@Injectable()
export class ClassifierService {
  async classify(text: string): Promise<string> {
    const lowerText = text.toLowerCase();

    const hasAny = (...terms: string[]) => terms.some((term) => lowerText.includes(term));

    // DPA signals should win first because those documents also contain many NDA-like terms.
    if (hasAny('data processing agreement', 'data protection addendum', 'gdpr', 'sub-processor', 'subprocessor')) {
      return 'dpa';
    }

    if (hasAny('non-disclosure', 'confidentiality agreement') || /\bnda\b/.test(lowerText)) {
      return 'nda';
    }

    if (hasAny('enterprise agreement', 'order form', 'purchase order', 'procurement')) {
      return 'enterprise_agreement';
    }

    if (hasAny('master services agreement', 'msa', 'software as a service', 'saas')) {
      return 'saas_msa';
    }

    if (hasAny('services agreement', 'statement of work', 'consulting services')) {
      return 'service_agreement';
    }

    if (hasAny('lease agreement', 'rental agreement', 'tenancy', 'landlord', 'tenant')) {
      return 'rental_lease';
    }

    if (hasAny('construction contract', 'epc contract', 'work order', 'contractor', 'site work')) {
      return 'construction_contract';
    }

    if (hasAny('supply agreement', 'purchase agreement', 'procurement agreement', 'buyer', 'seller')) {
      return 'supply_purchase_agreement';
    }

    if (hasAny('manufacturing agreement', 'contract manufacturing', 'oem', 'tooling', 'factory')) {
      return 'manufacturing_agreement';
    }

    if (hasAny('license agreement', 'licensing agreement', 'royalty', 'field of use', 'licensed technology')) {
      return 'licensing_agreement';
    }

    if (hasAny('reseller agreement', 'distribution agreement', 'channel partner', 'distributor')) {
      return 'distribution_reseller_agreement';
    }

    if (hasAny('loan agreement', 'facility agreement', 'credit agreement', 'borrower', 'lender')) {
      return 'loan_financing_agreement';
    }

    if (hasAny('employment agreement', 'employment contract', 'employee', 'employer', 'salary', 'compensation')) {
      return 'employment_contract';
    }

    if (hasAny('joint venture', 'partnership agreement', 'jv agreement', 'partners')) {
      return 'partnership_joint_venture';
    }

    return 'general_contract';
  }
}
