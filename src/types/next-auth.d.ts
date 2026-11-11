import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      /** True when the address is listed in ADMIN_EMAILS. */
      isAdmin?: boolean;
    };
  }
}
