import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { AuthError } from '../lib/errors';

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findFirst({
    where: { email },
    include: { tenant: true },
  });

  if (!user) {
    throw new AuthError();
  }

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    throw new AuthError();
  }

  return user;
}
