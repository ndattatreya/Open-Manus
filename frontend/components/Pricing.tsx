import React, { useState } from "react";
import { Check, Calendar, Zap } from "lucide-react";

interface Feature {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  text: string;
  strikethrough?: boolean;
  link?: string;
  badge?: string;
}

interface Plan {
  name: string;
  badge?: string;
  monthlyPrice: number;
  description: string;
  isCurrent?: boolean;
  isBestValue?: boolean;
  features: Feature[];
}

const PricingPage: React.FC = () => {
  const [isAnnual, setIsAnnual] = useState(true);

  const handleCheckout = (plan: Plan) => {
    if (plan.monthlyPrice === 0) {
      alert("You're already on the Free plan!");
      return;
    }

    const yearlyPrice = Math.round(plan.monthlyPrice * 0.83);
    const finalPrice = isAnnual ? yearlyPrice : plan.monthlyPrice;

    const options = {
      key: "rzp_test_5NFOiDIrADrIHb",
      amount: finalPrice * 100,
      currency: "INR",
      name: "Nava AI",
      description: `Upgrade to ${plan.name} Plan`,
      image: "/logo.png",
      handler: function (response: any) {
        alert(`Payment successful! Payment ID: ${response.razorpay_payment_id}`);
      },
      prefill: {
        name: "User",
        email: "user@example.com",
        contact: "9999999999",
      },
      theme: {
        color: "#6366f1",
      },
    };

    const rzp = new (window as any).Razorpay(options);
    rzp.open();
  };

  const plans: Plan[] = [
    {
      name: "Free",
      monthlyPrice: 0,
      description: "Try Nava AI",
      isCurrent: true,
      features: [
        { icon: Check, text: "Access to Chat mode" },
        { icon: Zap, text: "1 concurrent task", strikethrough: true },
        { icon: Calendar, text: "1 scheduled task", strikethrough: true },
      ],
    },
    {
      name: "Basic",
      badge: "Beta",
      monthlyPrice: 300,
      description: "More access to advanced features",
      features: [
        { icon: Check, text: "300 refresh credits everyday" },
        { icon: Check, text: "1,900 credits per month", link: "Learn more" },
        { icon: Calendar, text: "+1,900 extra credits per month", badge: "LIMITED OFFER" },
        { icon: Check, text: "Unlimited access to Chat mode" },
        { icon: Check, text: "Use advanced models in Agent mode" },
        { icon: Zap, text: "2 concurrent tasks" },
        { icon: Calendar, text: "2 scheduled tasks" },
        { icon: Check, text: "Slides, image and video generation" },
        { icon: Check, text: "Wide Research" },
      ],
    },
    {
      name: "Plus",
      badge: "Beta",
      monthlyPrice: 470,
      description: "Extended usage for everyday productivity",
      features: [
        { icon: Check, text: "300 refresh credits everyday" },
        { icon: Check, text: "3,900 credits per month", link: "Learn more" },
        { icon: Calendar, text: "+3,900 extra credits per month", badge: "LIMITED OFFER" },
        { icon: Check, text: "Unlimited access to Chat mode" },
        { icon: Check, text: "Use advanced models in Agent mode" },
        { icon: Zap, text: "3 concurrent tasks" },
        { icon: Calendar, text: "3 scheduled tasks" },
        { icon: Check, text: "Slides, image and video generation" },
        { icon: Check, text: "Wide Research" },
      ],
    },
    {
      name: "Pro",
      badge: "Beta",
      monthlyPrice: 650,
      description: "Full access for professional productivity",
      isBestValue: true,
      features: [
        { icon: Check, text: "300 refresh credits everyday" },
        { icon: Check, text: "19,900 credits per month", link: "Learn more" },
        { icon: Calendar, text: "+19,900 extra credits per month", badge: "LIMITED OFFER" },
        { icon: Check, text: "Unlimited access to Chat mode" },
        { icon: Check, text: "Use advanced models in Agent mode" },
        { icon: Zap, text: "10 concurrent tasks" },
        { icon: Calendar, text: "10 scheduled tasks" },
        { icon: Check, text: "Slides, image and video generation" },
        { icon: Check, text: "Wide Research" },
        { icon: Check, text: "Early access to beta features" },
      ],
    },
  ];

  const getPrice = (price: number) =>
    price === 0 ? 0 : isAnnual ? Math.round(price * 0.83) : price;

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 pt-24 bg-background text-foreground transition-colors duration-300">
      <div className="max-w-[1400px] mx-auto">

        <h1 className="text-4xl md:text-5xl font-semibold text-center mb-12">
          Upgrade your plan for more credits
        </h1>

        {/* Billing Toggle */}
        <div className="flex justify-center mb-12">
          <div className="flex bg-muted rounded-lg p-1 shadow-inner">
            <button
              onClick={() => setIsAnnual(false)}
              className={`px-6 py-2 rounded-md text-sm transition font-medium ${!isAnnual ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setIsAnnual(true)}
              className={`px-6 py-2 rounded-md text-sm transition font-medium ${isAnnual ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
            >
              Annually <span className="text-blue-500 ml-1">Save 17%</span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((plan, i) => (
            <div
              key={i}
              className={`rounded-2xl p-6 relative min-h-[620px] border shadow bg-card backdrop-blur-xl transition-all duration-300 ${plan.isBestValue ? "border-primary shadow-lg scale-[1.02]" : ""
                }`}
            >
              {plan.isBestValue && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs px-4 py-1 rounded-full font-semibold">
                  BEST VALUE
                </div>
              )}

              {/* Header */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="text-2xl font-semibold">{plan.name}</h2>
                  {plan.badge && (
                    <span className="bg-muted text-muted-foreground text-xs px-2 py-1 rounded">
                      {plan.badge}
                    </span>
                  )}
                </div>

                <div className="mb-1">
                  <span className="text-5xl font-bold">₹{getPrice(plan.monthlyPrice)}</span>
                  <span className="text-muted-foreground ml-1">
                    / month{isAnnual && plan.monthlyPrice > 0 ? ", billed yearly" : ""}
                  </span>
                </div>

                <p className="text-muted-foreground text-sm">{plan.description}</p>
              </div>

              {/* Button */}
              <button
                onClick={() => !plan.isCurrent && handleCheckout(plan)}
                className={`w-full py-3 rounded-lg mb-6 font-medium transition ${plan.isCurrent
                    ? "bg-[#3a3a3a] text-gray-400 cursor-default"
                    : plan.isBestValue
                      ? "bg-blue-500 hover:bg-blue-600 text-white"
                      : "bg-white hover:bg-gray-200 text-black"
                  }`}
              >
                {plan.isCurrent ? "Current plan" : `Upgrade to ${plan.name}`}
              </button>


              {/* Features */}
              <div>
                {plan.features.map((f, idx) => {
                  const Icon = f.icon;
                  return (
                    <div key={idx} className="flex items-start gap-3 mb-3">
                      <Icon className="w-5 h-5 text-green-500 mt-1" />
                      <div>
                        <p
                          className={`text-sm ${f.strikethrough
                              ? "text-muted-foreground line-through"
                              : "text-foreground"
                            }`}
                        >
                          {f.text}
                          {f.link && (
                            <a href="#" className="text-primary ml-1 text-xs">
                              {f.link}
                            </a>
                          )}
                        </p>
                        {f.badge && (
                          <p className="text-[10px] text-muted-foreground mt-1">{f.badge}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          ))}
        </div>

      </div>
    </div>
  );
};

export default PricingPage;
