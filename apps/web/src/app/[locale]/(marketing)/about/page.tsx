'use client';

import React from 'react';

const timelineData = [
  {
    year: '2024',
    description:
      'STRONGER TOGETHER is our core value. As a club, we strive to create a community where everyone can learn and grow together.',
  },
  {
    year: '2023',
    description:
      'We are a community fueled by the passion for technology and innovations.',
  },
  {
    year: '2022',
    description:
      'Our club has come together to create not only a playground for tech enthusiasts, but also for other students from The School of Science, Engineering, and Technology.',
  },
  {
    year: '2021',
    description: 'Once you have passion in technology, you are a part of us!',
  },
];

export default function MarketingPage() {
  return (
    <div className="mb-32 h-screen w-full px-4 pt-20 lg:px-6">
      <div
        className="flex h-24 items-center justify-center rounded-lg border-2 border-[#5FC6E5] text-center lg:h-28"
        style={{
          background: `linear-gradient(
      to right,
      #356F80 0%, #030303 20%, /* Left gradient */
      #000000 40%, #000000 60%, /* Middle black section */
      #030303 80%, #A58211 100% /* Right gradient */
    )`,
        }}
      >
        <p className="bg-gradient-to-r from-[#F4B71A] to-[#1AF4E6] bg-clip-text text-3xl font-black tracking-normal text-transparent lg:text-6xl lg:tracking-wide">
          NEO Culture Tech history
        </p>
      </div>

      <div
        className="relative mt-8 h-2/3 rounded-lg p-0.5 [clip-path:polygon(100%_0,_100%_100%,_10%_100%,_0_90%,_0_10%,_10%_0)] lg:h-full"
        style={{
          background:
            'linear-gradient(to bottom, #1AF4E6 0%, #FFFFFF 50%, #F4B71A 100%)',
        }}
      >
        <div className="h-full w-full rounded-lg bg-[#100921] px-3 [clip-path:polygon(100%_0,_100%_100%,_10%_100%,_0_90%,_0_10%,_10%_0)] lg:px-20">
          <div className="flex flex-col items-center justify-center gap-8 pt-12 lg:gap-14 lg:pt-14">
            {timelineData.map((data) => (
              <div
                className="flex w-full items-center justify-between gap-1 lg:gap-5"
                key={data.year}
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#5FC6E5] text-center text-base font-black text-white lg:h-28 lg:w-28 lg:text-3xl">
                  {data.year}
                </div>
                <p className="w-[90%] text-xs font-semibold text-white lg:text-3xl">
                  {data.description}
                </p>
              </div>
            ))}
          </div>

          {/* Blue Lines */}
          <div className="absolute right-6 top-3 h-0.5 w-3/4 bg-[#1AF4E6] lg:right-20 lg:top-3 lg:h-1 lg:w-4/5"></div>
          <div className="absolute right-6 top-5 h-0.5 w-3/4 bg-[#1AF4E6] bg-opacity-70 lg:right-20 lg:top-6 lg:h-1 lg:w-4/5"></div>
          <div className="absolute right-6 top-7 h-0.5 w-3/4 bg-[#1AF4E6] bg-opacity-50 lg:right-20 lg:top-9 lg:h-1 lg:w-4/5"></div>
          <div className="absolute right-6 top-9 h-0.5 w-3/4 bg-[#1AF4E6] bg-opacity-30 lg:right-20 lg:top-12 lg:h-1 lg:w-4/5"></div>
          <div className="absolute right-6 top-11 h-0.5 w-3/4 bg-[#1AF4E6] bg-opacity-10 lg:right-20 lg:top-[3.75rem] lg:h-1 lg:w-4/5"></div>

          {/* Yellow Lines */}
          <div className="absolute right-6 top-[7rem] h-0.5 w-3/4 bg-[#FBC721] bg-opacity-10 lg:right-20 lg:top-[11rem] lg:h-1 lg:w-4/5"></div>
          <div className="absolute right-6 top-[7.5rem] h-0.5 w-3/4 bg-[#FBC721] bg-opacity-30 lg:right-20 lg:top-[11.75rem] lg:h-1 lg:w-4/5"></div>
          <div className="absolute right-6 top-[8rem] h-0.5 w-3/4 bg-[#FBC721] bg-opacity-50 lg:right-20 lg:top-[12.5rem] lg:h-1 lg:w-4/5"></div>
          <div className="absolute right-6 top-[8.5rem] h-0.5 w-3/4 bg-[#FBC721] bg-opacity-70 lg:right-20 lg:top-[13.25rem] lg:h-1 lg:w-4/5"></div>
          <div className="absolute right-6 top-[9rem] h-0.5 w-3/4 bg-[#FBC721] lg:right-20 lg:top-[14rem] lg:h-1 lg:w-4/5"></div>
        </div>
      </div>
      {/* 
      <div className="relative mt-8 h-5/6 rounded-lg border px-24 [clip-path:polygon(100%_0,_100%_100%,_10%_100%,_0_90%,_0_10%,_10%_0)]">
        <div className="flex flex-col items-center justify-center gap-12 pt-14">
          {timelineData.map((data) => {
            return (
              <div className="flex w-full items-center justify-between gap-5">
                <div className="flex h-28 w-28 items-center justify-center rounded-full border-2 border-[#5FC6E5] text-center text-3xl font-black text-white">
                  {data.year}
                </div>

                <p className="w-[90%] text-3xl font-semibold text-white">
                  {data.description}
                </p>
              </div>
            );
          })}
        </div>
        <div className="absolute right-20 top-2 h-1 w-4/5 bg-[#1AF4E6]"></div>
        <div className="absolute right-20 top-5 h-1 w-4/5 bg-[#1AF4E6] bg-opacity-70"></div>
        <div className="absolute right-20 top-8 h-1 w-4/5 bg-[#1AF4E6] bg-opacity-50"></div>
        <div className="absolute right-20 top-11 h-1 w-4/5 bg-[#1AF4E6] bg-opacity-30"></div>
        <div className="absolute right-20 top-14 h-1 w-4/5 bg-[#1AF4E6] bg-opacity-10"></div>

        <div className="absolute right-20 top-[11rem] h-1 w-4/5 bg-[#FBC721] bg-opacity-10"></div>
        <div className="absolute right-20 top-[11.75rem] h-1 w-4/5 bg-[#FBC721] bg-opacity-30" />
        <div className="absolute right-20 top-[12.5rem] h-1 w-4/5 bg-[#FBC721] bg-opacity-50" />
        <div className="absolute right-20 top-[13.25rem] h-1 w-4/5 bg-[#FBC721] bg-opacity-70" />
        <div className="absolute right-20 top-[14rem] h-1 w-4/5 bg-[#FBC721]" />
      </div> */}

      {/* <div className="text-foreground mt-8 flex max-w-6xl flex-col gap-6 px-3 py-16">
        <div className="flex flex-col items-center">
          <h1 className="relative text-center text-4xl font-bold lg:text-7xl">
            <span className="sr-only">RMIT Neo Culture Tech</span>
            <div className="h-64 w-64">
              <svg
                width="100%"
                height="100%"
                viewBox="0 0 890 787"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M508.595 785.779C503.749 788.982 501.241 784.992 498.445 783.274C467.518 764.277 436.72 745.07 405.883 725.927C384.949 712.932 364.116 699.767 342.997 687.08C337.258 683.632 334.751 679.526 334.03 672.857C329.06 626.897 323.674 580.982 318.433 535.052C315.306 507.642 312.197 480.232 308.487 452.236C300.644 443.971 303.86 433.919 302.634 425.122C300.085 406.832 297.809 388.432 296.373 369.085C294.62 337.343 289.769 306.816 286.708 276.106C283.48 243.728 279.316 211.458 275.848 179.109C272.417 147.091 268.208 115.156 265.016 83.115C263.912 72.028 260.151 60.892 264.326 48.748C281.213 42.42 298.461 39.067 315.46 34.771C343.763 27.618 372.199 20.989 401.372 14.052C409.134 14.597 414.447 18.775 420.097 22.269C438.514 33.656 456.631 45.538 475.281 56.532C485.017 62.271 490.256 70.086 491.393 81.278C494.486 111.737 498.783 142.063 501.887 172.52C505.664 209.6 510.455 246.557 514.744 283.574C518.497 315.96 521.761 348.401 525.895 381.627C526.421 405.83 530.415 428.815 532.925 451.939C536.439 484.323 540.575 516.636 544.165 549.014C547.609 580.072 551.019 611.134 554.884 642.146C557.268 661.276 559.652 680.415 560.896 700.493C561.133 706.6 558.65 710.982 555.982 715.182C542.628 736.207 529.305 757.251 516.097 778.368C514.305 781.233 512.277 783.802 508.595 785.778V785.779Z"
                  fill="#4896AC"
                />
                <path
                  d="M263.89 48.228C267.59 61.504 268.209 75.471 269.846 89.292C275.164 134.196 280.106 179.145 285.152 224.081C288.862 257.125 292.608 290.166 296.136 323.23C297.652 337.433 300.381 351.527 300.068 366.77C295.584 383.444 285.004 395.795 276.57 409.241C245.603 458.609 214.866 508.121 183.752 557.396C180.237 562.963 177.623 569.327 171.196 573.604C167.67 577.692 165.267 574.608 162.964 573.204C151.314 566.104 139.714 558.919 128.17 551.645C87.63 526.092 47.104 500.517 6.592 474.92C-1.001 470.124 -1.824 471.794 4.096 462.337C15.043 444.847 25.946 427.327 36.891 409.836C109.444 293.88 182.005 177.929 254.575 61.983C257.513 57.2869 260.62 52.6989 263.89 48.228ZM559.134 703.833C554.448 681.363 552.894 658.753 550.097 636.299C546.024 603.596 542.283 570.851 538.46 538.118C535.795 515.305 533.242 492.48 530.616 469.663C527.798 445.186 524.916 420.716 522.158 396.232C521.675 391.938 521.669 387.59 521.576 382.322C532.754 354.488 551.289 332.034 565.809 307.2C569.583 300.745 571.966 293.07 579.532 288.663C586.342 281.184 590.982 272.763 596.029 264.623C598.233 261.068 600.7 258.799 605.081 257.779C649.948 247.332 694.753 236.623 740.335 225.984C744.914 226.076 748.128 227.775 751.245 229.769C771.16 242.512 791.36 254.798 811.382 267.369C827.102 277.237 828.008 281.189 818.112 297.015C771.15 372.115 723.985 447.088 676.919 522.123C641.001 579.385 605.252 636.753 569.039 693.83C566.591 697.687 564.666 702.195 559.134 703.833Z"
                  fill="#032639"
                />
                <path
                  d="M558.177 704.365C579.763 669.947 601.21 636.282 622.442 602.482C671.842 523.842 721.147 445.142 770.47 366.452C787.088 339.94 803.684 313.414 820.196 286.835C824.42 280.037 824.323 279.825 817.42 275.485C794.316 260.955 771.151 246.523 748.036 232.012C745.801 230.609 743.745 228.921 741.35 226.673C758.144 220.245 775.933 217.45 793.255 212.803C796.252 211.999 798.427 213.254 800.683 214.673C828.881 232.39 857.093 250.085 885.243 267.877C890.487 271.191 890.459 271.433 886.439 277.974C858.532 323.377 830.846 368.917 802.597 414.106C740.983 512.668 679.091 611.056 617.277 709.493C604.877 729.239 592.198 748.812 579.924 768.635C577.394 772.721 574.21 774.833 569.731 775.627C549.746 779.165 529.767 782.732 508.941 786.317C511.848 777.452 517.478 769.647 522.534 761.521C534.269 742.657 546.13 723.872 558.177 704.365ZM579.95 287.843C573.362 303.113 563.946 316.07 555.6 329.662C544.97 346.971 533.93 364.027 522.388 381.284C517.525 344.337 513.385 307.293 509.146 270.26C505.512 238.502 501.756 206.757 498.073 175.004C494.163 141.282 490.161 107.569 486.499 73.82C485.949 68.752 483.274 66.335 479.423 63.948C457.059 50.086 434.776 36.095 412.495 22.099C409.142 19.992 405.375 18.408 402.54 14.518C418.89 8.36601 436.333 5.55601 453.263 0.76801C456.223 -0.0709904 458.437 1.01101 460.723 2.42501C490.153 20.628 519.563 38.862 549.032 57.002C552.176 58.938 553.476 61.407 553.881 65.059C557.869 101.083 562.026 137.088 566.128 173.099C570.27 209.455 574.397 245.813 578.564 282.166C578.752 283.81 579.274 285.415 579.95 287.843Z"
                  fill="#F9B61D"
                />
                <path
                  d="M171.483 574.163C170.204 571.496 172.008 569.775 173.21 567.853C214.192 502.339 255.188 436.835 296.199 371.34C296.9 370.22 297.798 369.221 299.25 367.907C302.28 388.44 304.694 409.227 307.026 430.025C307.764 436.608 309.107 443.177 307.946 450.754C286.869 484.844 265.659 517.924 244.973 551.33C240.785 558.092 236.1 562.004 228.115 563.358C209.428 566.528 190.883 570.54 171.483 574.163Z"
                  fill="#F8B51D"
                />
              </svg>
            </div>
          </h1>

          <p className="mx-auto my-4 max-w-4xl text-center text-lg font-semibold !leading-tight md:mb-8 md:text-2xl lg:text-3xl">
            Established in{' '}
            <span className="text-blue-500 underline decoration-dashed underline-offset-4 dark:text-blue-300">
              2020
            </span>
            , Neo Culture Tech is a student-led community
            <span>
              {' at '}
              <span className="text-brand-light-red font-bold underline underline-offset-4">
                RMIT University
              </span>
            </span>
            .
          </p>

          <div className="bg-foreground/5 border-foreground/10 text-foreground relative mx-auto mb-4 max-w-4xl rounded-lg border p-4 text-center text-lg font-semibold tracking-wide">
            We are a community fueled by the passion for technology and
            innovations. Our club has come together to create not only a
            playground for tech enthusiasts, but also for other students from{' '}
            <span className="text-brand-light-red font-bold">
              The School of Science, Engineering, and Technology
            </span>
            . So that students are well-prepared for future careers.{' '}
            <span className="rounded border border-purple-600/20 bg-purple-600/10 px-1 py-0.5 font-semibold text-purple-600 dark:border-purple-300/20 dark:bg-purple-300/10 dark:text-purple-300">
              STRONGER TOGETHER
            </span>{' '}
            is our philosophy - Once you have passion in technology, you are a
            part of us!
          </div>

          <div className="via-foreground/10 my-8 w-full bg-gradient-to-r from-transparent to-transparent p-[1px]" />

          <div className="flex flex-col items-center justify-center text-center">
            <div className="mb-4 text-4xl font-bold">Our Mission</div>
            <div className="grid gap-4 font-semibold md:grid-cols-2">
              <div className="rounded-lg border border-green-600/20 bg-green-600/10 p-4 text-green-600 dark:border-green-300/20 dark:bg-green-300/10 dark:text-green-300">
                Create a society for emerging technological projects so that you
                can SHARE & CONNECT
              </div>
              <div className="rounded-lg border border-blue-600/20 bg-blue-600/10 p-4 text-blue-600 dark:border-blue-300/20 dark:bg-blue-300/10 dark:text-blue-300">
                Bring your technological ideas to real world application and
                bridge the gap of knowledge between classroom and real-world
                practices.
              </div>
              <div className="rounded-lg border border-purple-600/20 bg-purple-600/10 p-4 text-purple-600 dark:border-purple-300/20 dark:bg-purple-300/10 dark:text-purple-300">
                Establish an alumni network so that you can acquire realistic
                experience from them.
              </div>
              <div className="rounded-lg border border-orange-600/20 bg-orange-600/10 p-4 text-orange-600 dark:border-orange-300/20 dark:bg-orange-300/10 dark:text-orange-300">
                Keep you updated with the latest technology trends, events and
                knowledge.
              </div>
            </div>
          </div>

          <div className="via-foreground/10 my-8 w-full bg-gradient-to-r from-transparent to-transparent p-[1px]" />

          <div>
            <div className="bg-brand-light-blue/5 text-brand-light-blue relative mx-auto mb-4 mt-32 max-w-4xl rounded-lg border border-cyan-500/20 p-4 text-center text-lg font-semibold tracking-wide md:text-xl lg:text-2xl dark:border-cyan-300/20">
              <Sparkles className="text-brand-light-yellow absolute -right-3 -top-3 h-8 w-8" />
              <Sparkles className="text-brand-light-yellow absolute -bottom-3 -left-3 h-8 w-8" />
              &quot;To newbies of our NEO Culture Tech club, first of all I
              would like to thank you for choosing to be a member of the NEO
              family in your unilife. I hope that we will have a wonderful time
              working together for the development of the club. I also hope you
              will learn new things, make new friends, and have unforgettable
              memories in your journey with NEO. I wish you the best. Love you
              all!&quot;
            </div>
            <div className="mx-auto flex items-center justify-center text-center">
              <div className="relative mx-4 mb-32 max-w-xl rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-center text-sm font-semibold tracking-wide md:mx-8 md:p-4 md:text-base lg:text-lg dark:border-red-300/20 dark:bg-red-300/10">
                <div className="font-bold leading-tight text-red-700 dark:text-red-100">
                  Tran Mach So Han
                </div>
                <div className="text-sm text-red-500 dark:text-red-300">
                  President of RMIT Neo Culture Tech
                </div>
              </div>
            </div>
          </div>
        </div>
      </div> */}
    </div>
  );
}
