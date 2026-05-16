// Package diddoc builds minimal W3C DID Core documents for the issuer.
package diddoc

import (
	"encoding/json"
	"fmt"
	"time"
)

// Document is the subset of the W3C DID Core 1.0 data model that the issuer
// currently emits. Fields are JSON-tagged with the casing the spec mandates.
//
// We intentionally start small: just `@context`, `id`, `created`, and the
// operator-derived `verificationMethod`. Key rotation, services, and
// delegation chains land in follow-ups alongside the W3C DID Update flow.
type Document struct {
	Context              []string             `json:"@context"`
	ID                   string               `json:"id"`
	Created              string               `json:"created"`
	VerificationMethod   []VerificationMethod `json:"verificationMethod"`
	Authentication       []string             `json:"authentication"`
	AssertionMethod      []string             `json:"assertionMethod"`
	CapabilityInvocation []string             `json:"capabilityInvocation"`
}

// VerificationMethod is a single key reference within a DID document.
type VerificationMethod struct {
	ID                 string `json:"id"`
	Type               string `json:"type"`
	Controller         string `json:"controller"`
	PublicKeyMultibase string `json:"publicKeyMultibase,omitempty"`
}

// Build returns a populated, JSON-serialisable Document for the supplied
// placeholder DID (we only know the real did:hedera:... after the topic is
// created, so the caller patches the IDs once the topic ID is known).
//
// The `controllerPublicKeyMultibase` parameter is the multibase-encoded
// public key that controls the DID; for now this is the operator's public
// key (treasury/relayer pattern from ADR-0002).
func Build(did string, controllerPublicKeyMultibase string) Document {
	if did == "" {
		// A pre-mint placeholder DID. The HCS topic ID is not yet known when
		// the caller invokes us in some flows, so we leave the placeholder
		// in place and let the issuer rewrite it after `TopicCreate`.
		did = "did:hedera:placeholder"
	}
	verificationKey := fmt.Sprintf("%s#key-1", did)
	return Document{
		Context: []string{
			"https://www.w3.org/ns/did/v1",
			"https://w3id.org/security/suites/ed25519-2020/v1",
		},
		ID:      did,
		Created: time.Now().UTC().Format(time.RFC3339Nano),
		VerificationMethod: []VerificationMethod{
			{
				ID:                 verificationKey,
				Type:               "Ed25519VerificationKey2020",
				Controller:         did,
				PublicKeyMultibase: controllerPublicKeyMultibase,
			},
		},
		Authentication:       []string{verificationKey},
		AssertionMethod:      []string{verificationKey},
		CapabilityInvocation: []string{verificationKey},
	}
}

// Marshal returns the deterministic JSON encoding of the document. We avoid
// HTML-escape transformations so HCS messages match the document's
// canonical form bit-for-bit.
func (d Document) Marshal() ([]byte, error) {
	return json.Marshal(d)
}
