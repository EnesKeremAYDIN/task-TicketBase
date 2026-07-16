import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { AuthError } from '../lib/errors';

const DUMMY_HASH = '$2a$10$' + 'x'.repeat(53);

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findFirst({
    where: { email },
    include: { tenant: true },
  });

  const hashToCompare = user?.password || DUMMY_HASH;
  const isValid = await bcrypt.compare(password, hashToCompare);

  if (!user || !isValid) {
    throw new AuthError();
  }

  return user;
}
