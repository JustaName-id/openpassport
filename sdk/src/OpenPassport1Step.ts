import { groth16 } from 'snarkjs';
import {
  attributeToPosition,
  countryCodes,
  DEFAULT_RPC_URL,
  PASSPORT_ATTESTATION_ID,
} from '../../common/src/constants/constants';
import { getCurrentDateFormatted, getVkey, verifyDSCValidity } from '../utils/utils';
import { unpackReveal } from '../../common/src/utils/revealBitmap';
import { OpenPassportVerifierReport } from './OpenPassportVerifierReport';

import forge from 'node-forge';
import {
  bigIntToHex,
  castFromScope,
  castToScope,
  castToUUID,
  splitToWords,
} from '../../common/src/utils/utils';
import { getSignatureAlgorithm } from '../../common/src/utils/handleCertificate';

export class OpenPassport1StepVerifier {
  scope: string;
  attestationId: string;
  requirements: string[][];
  rpcUrl: string;
  report: OpenPassportVerifierReport;
  dev_mode: boolean;

  constructor(options: {
    scope: string;
    attestationId?: string;
    requirements?: string[][];
    rpcUrl?: string;
    dev_mode?: boolean;
  }) {
    this.scope = options.scope;
    this.attestationId = options.attestationId || PASSPORT_ATTESTATION_ID;
    this.requirements = options.requirements || [];
    this.rpcUrl = options.rpcUrl || DEFAULT_RPC_URL;
    this.report = new OpenPassportVerifierReport();
    this.dev_mode = options.dev_mode || false;
  }

  async verify(
    openPassport1StepInputs: OpenPassport1StepInputs
  ): Promise<OpenPassportVerifierReport> {
    const { signatureAlgorithm, hashFunction } = getSignatureAlgorithm(openPassport1StepInputs.dsc);
    const vkey = getVkey(openPassport1StepInputs.circuit, signatureAlgorithm, hashFunction);
    const parsedPublicSignals = parsePublicSignals1Step(
      openPassport1StepInputs.dscProof.publicSignals
    );
    //1. Verify the scope
    if (castToScope(parsedPublicSignals.scope) !== this.scope) {
      this.report.exposeAttribute('scope', parsedPublicSignals.scope, this.scope);
    }
    console.log('\x1b[32m%s\x1b[0m', `- scope verified`);

    //4. Verify the current_date
    if (parsedPublicSignals.current_date.toString() !== getCurrentDateFormatted().toString()) {
      this.report.exposeAttribute(
        'current_date',
        parsedPublicSignals.current_date,
        getCurrentDateFormatted()
      );
    }
    console.log('\x1b[32m%s\x1b[0m', `- current_date verified`);

    //5. Verify requirements
    const unpackedReveal = unpackReveal(parsedPublicSignals.revealedData_packed);
    for (const requirement of this.requirements) {
      const attribute = requirement[0];
      const value = requirement[1];
      const position = attributeToPosition[attribute];
      let attributeValue = '';
      for (let i = position[0]; i <= position[1]; i++) {
        attributeValue += unpackedReveal[i];
      }
      if (requirement[0] === 'nationality' || requirement[0] === 'issuing_state') {
        if (!countryCodes[attributeValue] || countryCodes[attributeValue] !== value) {
          this.report.exposeAttribute(attribute as keyof OpenPassportVerifierReport);
        }
      } else {
        if (attributeValue !== value) {
          this.report.exposeAttribute(attribute as keyof OpenPassportVerifierReport);
        }
      }
      console.log('\x1b[32m%s\x1b[0m', `- requirement ${requirement[0]} verified`);
    }

    //6. Verify the proof

    const verified_prove = await groth16.verify(
      vkey,
      openPassport1StepInputs.dscProof.publicSignals,
      openPassport1StepInputs.dscProof.proof as any
    );
    if (!verified_prove) {
      this.report.exposeAttribute('proof');
    }
    console.log('\x1b[32m%s\x1b[0m', `- proof verified`);

    this.report.nullifier = bigIntToHex(BigInt(parsedPublicSignals.nullifier));
    this.report.user_identifier = bigIntToHex(BigInt(parsedPublicSignals.user_identifier));

    //7 Verify the dsc
    const dscCertificate = forge.pki.certificateFromPem(openPassport1StepInputs.dsc);
    const verified_certificate = verifyDSCValidity(dscCertificate, this.dev_mode);
    console.log('\x1b[32m%s\x1b[0m', 'certificate verified:' + verified_certificate);

    // @ts-ignore
    const dsc_modulus = BigInt(dscCertificate.publicKey.n);
    const dsc_modulus_words = splitToWords(dsc_modulus, BigInt(64), BigInt(32));
    const modulus_from_proof = parsedPublicSignals.pubKey;

    const areArraysEqual = (arr1: string[], arr2: string[]) =>
      arr1.length === arr2.length && arr1.every((value, index) => value === arr2[index]);

    const verified_modulus = areArraysEqual(dsc_modulus_words, modulus_from_proof);
    console.log('\x1b[32m%s\x1b[0m', 'modulus verified:' + verified_modulus);
    return this.report;
  }
}

export class OpenPassport1StepInputs {
  dscProof: {
    publicSignals: string[];
    proof: string[];
  };
  dsc: string;
  circuit: string;

  constructor(options: {
    dscProof?: {
      publicSignals: string[];
      proof: string[];
    };
    dsc?: string;
    circuit?: string;
  }) {
    this.dscProof = options.dscProof || {
      publicSignals: [],
      proof: [],
    };
    this.dsc = options.dsc || '';
    this.circuit = options.circuit || '';
  }
}

export function parsePublicSignals1Step(publicSignals) {
  return {
    signature_algorithm: publicSignals[0],
    revealedData_packed: [publicSignals[1], publicSignals[2], publicSignals[3]],
    nullifier: publicSignals[4],
    pubKey: publicSignals.slice(5, 37),
    scope: publicSignals[37],
    current_date: publicSignals.slice(38, 44),
    user_identifier: publicSignals[44],
  };
}
