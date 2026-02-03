import { NextRequest, NextResponse } from 'next/server';
import { stripe, PRICING_TIERS, SubscriptionTier } from '@/lib/stripe';
import { requireAuth } from '@/lib/auth-helpers';
import { User } from '@/lib/models/User';
import connectDB from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { error, userId, user } = await requireAuth();
    if (error) return error;

    const { tier } = await req.json() as { tier: SubscriptionTier };

    if (!tier || !PRICING_TIERS[tier] || tier === 'free') {
      return NextResponse.json(
        { success: false, error: 'Invalid tier selected' },
        { status: 400 }
      );
    }

    const priceId = PRICING_TIERS[tier].priceId;
    if (!priceId) {
      return NextResponse.json(
        { success: false, error: 'Price not configured for this tier' },
        { status: 400 }
      );
    }

    await connectDB();

    // Get or create Stripe customer
    const dbUser = await User.findById(userId);
    if (!dbUser) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    let customerId = dbUser.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user?.email || dbUser.email,
        name: user?.name || dbUser.name,
        metadata: {
          userId: userId!,
        },
      });
      customerId = customer.id;

      await User.findByIdAndUpdate(userId, {
        stripeCustomerId: customerId,
      });
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/pricing?canceled=true`,
      metadata: {
        userId: userId!,
        tier,
      },
      subscription_data: {
        metadata: {
          userId: userId!,
          tier,
        },
      },
    });

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      url: session.url,
    });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
