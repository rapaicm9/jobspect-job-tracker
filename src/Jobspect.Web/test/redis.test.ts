import { describe, expect, it } from "vitest";

import { parseRedisConnectionString } from "@/server/redis";

describe("parseRedisConnectionString", () => {
  describe("the StackExchange.Redis form the AppHost injects", () => {
    it("reads host and port", () => {
      expect(parseRedisConnectionString("localhost:6379")).toEqual({
        host: "localhost",
        port: 6379,
      });
    });

    it("defaults the port when the endpoint carries none", () => {
      expect(parseRedisConnectionString("cache")).toEqual({ host: "cache", port: 6379 });
    });

    it("splits on the last colon, so a bracketed IPv6 host survives", () => {
      expect(parseRedisConnectionString("[::1]:6380")).toEqual({ host: "[::1]", port: 6380 });
    });

    it("reads a password", () => {
      expect(parseRedisConnectionString("cache:6379,password=s3cret")).toEqual({
        host: "cache",
        port: 6379,
        password: "s3cret",
      });
    });

    it("reads ssl regardless of how it is cased", () => {
      expect(parseRedisConnectionString("cache:6379,ssl=True")).toEqual({
        host: "cache",
        port: 6379,
        tls: {},
      });
    });

    it("reads the shape the AppHost renders for a TLS endpoint", () => {
      expect(parseRedisConnectionString("localhost:53422,password=s3cret,ssl=true")).toEqual({
        host: "localhost",
        port: 53422,
        password: "s3cret",
        tls: {},
      });
    });

    it("ignores settings it has no use for", () => {
      expect(
        parseRedisConnectionString("cache:6379,abortConnect=false,connectTimeout=5000"),
      ).toEqual({ host: "cache", port: 6379 });
    });
  });

  describe("the URL form", () => {
    it("reads host and port", () => {
      expect(parseRedisConnectionString("redis://localhost:6379")).toEqual({
        host: "localhost",
        port: 6379,
      });
    });

    it("reads the password and the database", () => {
      expect(parseRedisConnectionString("redis://:s3cret@127.0.0.1:6380/4")).toEqual({
        host: "127.0.0.1",
        port: 6380,
        password: "s3cret",
        db: 4,
      });
    });

    it("turns rediss into a TLS connection", () => {
      expect(parseRedisConnectionString("rediss://cache")).toEqual({
        host: "cache",
        port: 6379,
        tls: {},
      });
    });
  });

  describe("shapes it will not guess at", () => {
    it("refuses an empty value", () => {
      expect(() => parseRedisConnectionString("   ")).toThrow(/empty/i);
    });

    it("refuses a value that does not start with an endpoint", () => {
      expect(() => parseRedisConnectionString("password=s3cret,cache:6379")).toThrow(
        /host:port endpoint/i,
      );
    });

    it("refuses a port that is not a number", () => {
      expect(() => parseRedisConnectionString("cache:redis")).toThrow(/unusable endpoint/i);
    });
  });
});
