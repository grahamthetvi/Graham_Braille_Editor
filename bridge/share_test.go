package main

import "testing"

func TestHashShareCode(t *testing.T) {
	a := hashShareCode("123456")
	b := hashShareCode("123456")
	c := hashShareCode("654321")
	if a != b {
		t.Fatalf("hash not stable")
	}
	if a == c {
		t.Fatalf("different codes should hash differently")
	}
	if !codesEqual("123456", a) {
		t.Fatalf("codesEqual failed for matching code")
	}
	if codesEqual("000000", a) {
		t.Fatalf("codesEqual should reject wrong code")
	}
}

func TestParseTargetID(t *testing.T) {
	kind, peer, printer := parseTargetID("local:My Printer")
	if kind != "local" || peer != "" || printer != "My Printer" {
		t.Fatalf("local parse: %s %s %s", kind, peer, printer)
	}
	kind, peer, printer = parseTargetID("peer:abcd1234:ViewPlus Columbia")
	if kind != "peer" || peer != "abcd1234" || printer != "ViewPlus Columbia" {
		t.Fatalf("peer parse: %s %s %s", kind, peer, printer)
	}
	kind, peer, printer = parseTargetID("PlainName")
	if kind != "local" || printer != "PlainName" {
		t.Fatalf("legacy parse: %s %s", kind, printer)
	}
}

func TestPeerBaseURL(t *testing.T) {
	if peerBaseURL("192.168.1.10") != "http://192.168.1.10:8081" {
		t.Fatalf("got %s", peerBaseURL("192.168.1.10"))
	}
	if peerBaseURL("host:9000") != "http://host:9000" {
		t.Fatalf("got %s", peerBaseURL("host:9000"))
	}
	if peerBaseURL("http://host:8081/") != "http://host:8081" {
		t.Fatalf("got %s", peerBaseURL("http://host:8081/"))
	}
}

func TestTokenMatches(t *testing.T) {
	if !tokenMatches("abcdef", "abcdef") {
		t.Fatal("expected match")
	}
	if tokenMatches("abc", "abcdef") {
		t.Fatal("length mismatch should fail")
	}
	if tokenMatches("", "abcdef") {
		t.Fatal("empty should fail")
	}
}
