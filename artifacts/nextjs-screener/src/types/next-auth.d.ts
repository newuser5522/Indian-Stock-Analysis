import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & NonNullable<import("next-auth").DefaultSession["user"]>;
  }
}
