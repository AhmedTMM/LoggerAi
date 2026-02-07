import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }),
  ],
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
      }
      // Pass through the user's profile image from the token
      if (token.picture && session.user) {
        session.user.image = token.picture as string;
      }
      return session;
    },
    async jwt({ token, user, account, profile, trigger }) {
      // On initial sign-in or update, store the profile picture
      if (account && profile?.picture) {
        token.picture = profile.picture;
      }
      // Also store from user object if available (initial sign-in)
      if (user?.image) {
        token.picture = user.image;
      }
      return token;
    },
  },
});
