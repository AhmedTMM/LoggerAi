'use client';

import Link from 'next/link';
import {
  Plane,
  Shield,
  FileText,
  Zap,
  CheckCircle,
  ArrowRight,
  Play,
  Users,
  Cloud,
  Brain,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

const features = [
  {
    icon: Brain,
    title: 'AI-Powered Parsing',
    description: 'Automatically extract data from logbooks, maintenance records, and POH documents using advanced AI.',
  },
  {
    icon: Shield,
    title: 'Safety Analysis',
    description: 'Get GO/CAUTION/NO-GO verdicts based on weather, pilot experience, and aircraft status.',
  },
  {
    icon: FileText,
    title: 'Smart Document Management',
    description: 'Upload any aviation document and let AI organize and extract relevant information.',
  },
  {
    icon: Cloud,
    title: 'Weather Integration',
    description: 'Real-time METAR data integrated into flight planning and safety assessments.',
  },
  {
    icon: Users,
    title: 'Pilot & Aircraft Profiles',
    description: 'Comprehensive profiles tracking certifications, experience, and maintenance status.',
  },
  {
    icon: Zap,
    title: 'Instant Audits',
    description: 'Automatic legality checks for flights based on current regulations.',
  },
];

const testimonials = [
  {
    quote: "LoggerAi has transformed how we manage our flight school's documentation.",
    author: 'Flight School Director',
    role: 'Part 141 School',
  },
  {
    quote: 'The AI safety analysis gives me confidence before every flight.',
    author: 'Private Pilot',
    role: 'Weekend Flyer',
  },
  {
    quote: 'Finally, a tool that understands aviation paperwork.',
    author: 'Chief Pilot',
    role: 'Charter Operation',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <Plane className="w-8 h-8 text-blue-600" />
              <span className="text-xl font-bold text-zinc-900">LoggerAi</span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/pricing" className="text-zinc-600 hover:text-zinc-900">
                Pricing
              </Link>
              <Link href="/login">
                <Button variant="outline" size="sm">
                  Sign In
                </Button>
              </Link>
              <Link href="/login">
                <Button size="sm">
                  Get Started
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-full text-blue-700 text-sm font-medium mb-8">
            <Zap className="w-4 h-4" />
            AI-Powered Aviation Intelligence
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-zinc-900 leading-tight mb-6">
            Your Flight Operations,{' '}
            <span className="text-blue-600">Simplified</span>
          </h1>
          <p className="text-xl text-zinc-600 max-w-3xl mx-auto mb-10">
            LoggerAi combines AI document parsing with intelligent safety analysis
            to streamline your aviation operations. From logbook digitization to
            pre-flight risk assessment.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Link href="/login">
              <Button size="lg" className="w-full sm:w-auto">
                Start Free Trial
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button variant="outline" size="lg" className="w-full sm:w-auto">
                View Pricing
              </Button>
            </Link>
          </div>

          {/* Demo Video Placeholder */}
          <div className="relative max-w-4xl mx-auto">
            <div className="aspect-video bg-zinc-900 rounded-2xl overflow-hidden shadow-2xl border border-zinc-800">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <button className="w-20 h-20 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-colors mb-4 mx-auto">
                    <Play className="w-10 h-10 text-white ml-1" />
                  </button>
                  <p className="text-white/80 text-lg">Watch Demo Video</p>
                  <p className="text-white/50 text-sm mt-1">2 min overview</p>
                </div>
              </div>
              {/* Placeholder gradient background */}
              <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 to-purple-600/20" />
              {/* Grid pattern overlay */}
              <div
                className="absolute inset-0 opacity-10"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                }}
              />
            </div>
            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-white rounded-full px-6 py-2 shadow-lg border border-zinc-200">
              <span className="text-sm text-zinc-600">Trusted by 500+ pilots</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-zinc-900 mb-4">
              Everything You Need for Safe Operations
            </h2>
            <p className="text-lg text-zinc-600 max-w-2xl mx-auto">
              From document management to safety analysis, LoggerAi handles the
              complexity so you can focus on flying.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className="p-6 bg-zinc-50 rounded-xl hover:bg-zinc-100 transition-colors"
              >
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-zinc-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-zinc-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-zinc-900 mb-4">
              How It Works
            </h2>
            <p className="text-lg text-zinc-600">
              Get started in minutes, not hours
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: '1',
                title: 'Upload Documents',
                description: 'Drag and drop your logbooks, maintenance records, or any aviation documents.',
              },
              {
                step: '2',
                title: 'AI Extracts Data',
                description: 'Our AI reads and organizes all relevant information automatically.',
              },
              {
                step: '3',
                title: 'Get Insights',
                description: 'Receive safety analysis, compliance checks, and actionable recommendations.',
              },
            ].map((item, index) => (
              <div key={index} className="relative text-center">
                <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-6">
                  {item.step}
                </div>
                <h3 className="text-xl font-semibold text-zinc-900 mb-2">
                  {item.title}
                </h3>
                <p className="text-zinc-600">{item.description}</p>
                {index < 2 && (
                  <div className="hidden md:block absolute top-8 left-[60%] w-[80%] h-0.5 bg-blue-200" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-zinc-900">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Trusted by Pilots Everywhere
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <div key={index} className="bg-zinc-800 rounded-xl p-6">
                <p className="text-zinc-300 text-lg mb-4">"{testimonial.quote}"</p>
                <div>
                  <p className="text-white font-medium">{testimonial.author}</p>
                  <p className="text-zinc-500 text-sm">{testimonial.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-zinc-900 mb-4">
            Ready to Streamline Your Operations?
          </h2>
          <p className="text-lg text-zinc-600 mb-8">
            Join hundreds of pilots using LoggerAi to make smarter, safer decisions.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/login">
              <Button size="lg">
                Get Started Free
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button variant="outline" size="lg">
                Compare Plans
              </Button>
            </Link>
          </div>
          <p className="text-sm text-zinc-500 mt-4">
            No credit card required. 5 free AI parses included.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-zinc-200">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Plane className="w-6 h-6 text-blue-600" />
              <span className="font-bold text-zinc-900">LoggerAi</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-zinc-600">
              <Link href="/pricing" className="hover:text-zinc-900">
                Pricing
              </Link>
              <Link href="#" className="hover:text-zinc-900">
                Privacy
              </Link>
              <Link href="#" className="hover:text-zinc-900">
                Terms
              </Link>
              <Link href="#" className="hover:text-zinc-900">
                Contact
              </Link>
            </div>
            <p className="text-sm text-zinc-500">
              © 2024 LoggerAi. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
