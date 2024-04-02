'use server'

import { z } from "zod"
import { sql } from "@vercel/postgres"
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { AuthError } from 'next-auth'
import { signIn } from '@/auth'

export type State = {
  errors?: {
    customerId?: string[];
    amount?: string[];
    status?: string[];
  };
  message?: string | null;
}

const FormSchema = z.object({
  id: z.string(),
  customerId: z.string({
    invalid_type_error: 'Plase select a customer.'
  }),
  amount: z.coerce
    .number()
    .gt(0, { message: 'Please enter en amount greater than $0.' }),
  status: z.enum(['paid', 'pending'], {
    invalid_type_error: 'Please select an invoice status.'
  }),
  date: z.string()
})

const CreateInvoice = FormSchema.omit({ id: true, date: true })

const UpdateInvoice = FormSchema.omit({ id: true, date: true })

export async function authenticate(_prevState: string | undefined, formData: FormData) {
  try {
    await signIn('credentials', formData)
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return 'Invalid credentials'
        default:
          return 'Somethings went wrong'
      }
    }
    throw error
  }
}

export async function createInvoice(prevState: State, formData: FormData) {
  const validateFields = CreateInvoice.safeParse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  })

  if (!validateFields.success) {
    return {
      errors: validateFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Invoice.',
    };
  }

  // Prepare data for insertion into the database
  const { customerId, amount, status } = validateFields.data  
  const amountInCents = amount * 100
  const date = new Date().toISOString().split('T')[0]

  // Insert data into the database
  try {
    await sql`
      INSERT INTO invoices (customer_id, amount, status, date)
      VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
    `
  } catch (error) {
    return {
      messsage: 'Database Erorr: Failed to Create Invoice'
    }
  }

  revalidatePath('/dashboard/invoices')
  redirect('/dashboard/invoices')
}

export async function updateInvoice(id: string, prevState: State, formData: FormData) {
  const validateFields = UpdateInvoice.safeParse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  })

  if (!validateFields.success) {
    return {
      errors: validateFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Invoice.',
    };
  }

  const { customerId, amount, status } = validateFields.data
  const amountInCents = amount * 100
  
  try {
    await sql`
      UPDATE invoices
      SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
      WHERE id=${id}
    `
  } catch (error) {
    return {
      message: 'Database Erorr: Failed to Update Invoice'
    }
  }
  revalidatePath('/dashboard/invoices')
  redirect('/dashboard/invoices')
}

export async function deleteInvoice(id: string) {
  // throw new Error('Failed to Delete Invoice');
  try {
    await sql`DELETE FROM invoices WHERE id=${id}`
    revalidatePath('/dashboard/invoices')
    return { message: 'Deleted Invoice' }
  } catch (error) {
    return { message: 'Database Error: Failed to Delete Invoice' }
  }
}