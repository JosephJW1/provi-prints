import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
  useZoomPanContext,
} from 'react-simple-maps';
import api from '../api/axios';
import ProtectedDesignPreview from '../components/ProtectedDesignPreview';

// --- Type Definitions aligned with Backend Models (Design & Towns) ---
interface HomePageProps {
  isDarkMode?: boolean;
}

interface Charity {
  name: string;
  logo: string;
  description: string;
}

export interface Design {
  id: number;
  title: string;
  description: string | null;
  image_url: string;
  createdAt?: string;
  updatedAt?: string;
  Towns?: Array<{
    id: number;
    townName: string;
    latitude?: number;
    longitude?: number;
  }>;
}

export interface BackendTown {
  id: number;
  townName: string;
  latitude: number;
  longitude: number;
  createdAt: string;
  updatedAt: string;
  Designs?: Design[];
}

interface Slide {
  id: number | string;
  city: string;
  design: Design;
  charities: Charity[];
}

interface CityUIDefinition {
  name: string;
  color: string;
  description: string;
  charities: Charity[];
}

interface CityData extends CityUIDefinition {
  designs: Design[];
}

const geoUrl = "/ltla2025.geojson";
const DEFAULT_MAP_CENTER: [number, number] = [-2.5, 54.8];
const FALLBACK_USER_COORDS: [number, number] = [-2.5873, 53.3900];
const LOCATION_ZOOM = 9;

interface TownMarkerProps {
  city: CityData & { coordinates: [number, number] };
  isSelected: boolean;
  onSelect: (cityName: string, shouldScroll?: boolean) => void;
}

const TownMarker: React.FC<TownMarkerProps> = ({ city, isSelected, onSelect }) => {
  const { k } = useZoomPanContext();

  return (
    <Marker
      coordinates={city.coordinates}
      onClick={() => onSelect(city.name, true)}
      className="cursor-pointer group focus:outline-none"
    >
      <g transform={`scale(${1 / k})`}>
        <circle cx="0" cy="-28" r="45" fill="transparent" />
        <g
          style={{ transformOrigin: '0px 0px' }}
          className={`transition-transform duration-300 ease-out drop-shadow-md ${
            isSelected ? 'scale-125' : 'group-hover:scale-125'
          }`}
        >
          <path
            d="M 0 0 C 8 -10 12 -20 12 -28 C 12 -36 6 -40 0 -40 C -6 -40 -12 -36 -12 -28 C -12 -20 -8 -10 0 0 Z"
            fill={city.color}
          />
          <rect
            x="-55"
            y="-43"
            width="110"
            height="30"
            rx="15"
            fill={city.color}
            stroke={isSelected ? '#e9c46a' : 'none'}
            strokeWidth={isSelected ? 3 : 0}
          />
          <text
            x="0"
            y="-28"
            textAnchor="middle"
            alignmentBaseline="middle"
            dominantBaseline="central"
            className="text-[17.25px] font-bold pointer-events-none"
            style={{
              fill: 'white',
              stroke: 'black',
              strokeWidth: '2.5px',
              strokeLinejoin: 'round',
              paintOrder: 'stroke fill',
            }}
          >
            {city.name}
          </text>
        </g>
      </g>
    </Marker>
  );
};

const HomePage: React.FC<HomePageProps> = ({ isDarkMode = false }) => {
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [selectedCharityName, setSelectedCharityName] = useState<string | null>(null);
  const [activeDesignIndex, setActiveDesignIndex] = useState<number>(0);
  const [currentSlide, setCurrentSlide] = useState<number>(0);
  const [townsData, setTownsData] = useState<BackendTown[]>([]);
  const [designsData, setDesignsData] = useState<Design[]>([]);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  const [userLocation, setUserLocation] = useState<[number, number]>(FALLBACK_USER_COORDS);

  // Swipe tracking refs for the print design coverflow
  const pointerStartX = useRef<number | null>(null);
  const pointerDeltaX = useRef<number>(0);
  const [dragOffsetX, setDragOffsetX] = useState<number>(0);

  // Drag-to-scroll & auto-scroll tracking refs for the charities/towns strip
  const charityScrollRef = useRef<HTMLDivElement | null>(null);
  const firstSetRef = useRef<HTMLDivElement | null>(null);
  const charityScrollPosRef = useRef<number>(0);
  const charityPauseUntilRef = useRef<number>(0);
  const charitySmoothAnimRef = useRef<{
    startScroll: number;
    targetScroll: number;
    startTime: number;
  } | null>(null);
  const charityDragStartX = useRef<number | null>(null);
  const charityStartScrollLeft = useRef<number>(0);
  const charityHasDragged = useRef<boolean>(false);

  // Section refs for smooth scroll navigation
  const townExplorerRef = useRef<HTMLDivElement | null>(null);
  const mapSectionRef = useRef<HTMLDivElement | null>(null);
  const [isPortrait, setIsPortrait] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : false
  );

  useEffect(() => {
    const updateOrientation = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };

    updateOrientation();
    window.addEventListener('resize', updateOrientation, { passive: true });
    return () => {
      window.removeEventListener('resize', updateOrientation);
    };
  }, []);

  const scrollToSection = useCallback(
    (targetRef: React.RefObject<HTMLDivElement | null>, align: 'top' | 'bottom' = 'top') => {
      if (!targetRef.current) return;
      const rect = targetRef.current.getBoundingClientRect();
      if (align === 'bottom') {
        const elementBottom = rect.bottom + window.scrollY;
        const targetTop = elementBottom - window.innerHeight + 24;
        window.scrollTo({
          top: Math.max(0, targetTop),
          behavior: 'smooth',
        });
        return;
      }
      const navEl = document.querySelector('nav');
      const navHeight = navEl ? navEl.getBoundingClientRect().height : 0;
      const elementTop = rect.top + window.scrollY;
      window.scrollTo({
        top: Math.max(0, elementTop - navHeight - 16),
        behavior: 'smooth',
      });
    },
    []
  );

  const [position, setPosition] = useState({
    coordinates: FALLBACK_USER_COORDS,
    zoom: 1
  });
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const hasResolvedLocationRef = useRef<boolean>(false);

  const fetchAndZoomToLocation = useCallback(() => {
    if ("geolocation" in navigator) {
      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords: [number, number] = [pos.coords.longitude, pos.coords.latitude];
          hasResolvedLocationRef.current = true;
          setIsLocating(false);
          setUserLocation(coords);
          setPosition({
            coordinates: coords,
            zoom: LOCATION_ZOOM
          });
        },
        () => {
          hasResolvedLocationRef.current = true;
          setIsLocating(false);
          setUserLocation(FALLBACK_USER_COORDS);
          setPosition({
            coordinates: FALLBACK_USER_COORDS,
            zoom: LOCATION_ZOOM
          });
        },
        { maximumAge: 600000, timeout: 5000 }
      );
    } else {
      hasResolvedLocationRef.current = true;
      setUserLocation(FALLBACK_USER_COORDS);
      setPosition({
        coordinates: FALLBACK_USER_COORDS,
        zoom: LOCATION_ZOOM
      });
    }
  }, []);

  const zoomToUserLocation = useCallback(() => {
    if (hasResolvedLocationRef.current) {
      setPosition({
        coordinates: userLocation,
        zoom: LOCATION_ZOOM
      });
      return;
    }
    fetchAndZoomToLocation();
  }, [userLocation, fetchAndZoomToLocation]);

  const getClampedZoomOutCenter = useCallback(
    (anchor: [number, number], portrait: boolean): [number, number] => {
      const [lon, lat] = anchor;
      const clampedLon = Math.max(-4.5, Math.min(-1.5, lon));
      if (portrait) {
        return [clampedLon, 54.8];
      }
      const clampedLat = Math.max(52.35, Math.min(57.11, lat));
      return [clampedLon, clampedLat];
    },
    []
  );

  const zoomOutAll = useCallback(() => {
    setPosition({
      coordinates: getClampedZoomOutCenter(userLocation, isPortrait),
      zoom: 1
    });
  }, [userLocation, isPortrait, getClampedZoomOutCenter]);

  // Keep zoomed-out view clamped without empty space when switching between portrait and landscape
  useEffect(() => {
    setPosition((prev) => {
      if (prev.zoom === 1) {
        return {
          coordinates: getClampedZoomOutCenter(userLocation, isPortrait),
          zoom: 1
        };
      }
      return prev;
    });
  }, [isPortrait, userLocation, getClampedZoomOutCenter]);

  useEffect(() => {
    let isMounted = true;
    setIsLoadingData(true);

    Promise.all([
      api.get<BackendTown[]>('/towns').catch((error) => {
        console.error("Error fetching towns:", error);
        return { data: [] as BackendTown[] };
      }),
      api.get<Design[]>('/designs').catch((error) => {
        console.error("Error fetching designs:", error);
        return { data: [] as Design[] };
      }),
    ]).then(([townsRes, designsRes]) => {
      if (!isMounted) return;
      setTownsData(townsRes.data);
      setDesignsData(designsRes.data);
      setIsLoadingData(false);
    });

    fetchAndZoomToLocation();

    return () => {
      isMounted = false;
    };
  }, [fetchAndZoomToLocation]);

  const baseCityUIData: CityUIDefinition[] = [
    {
      name: 'Edinburgh',
      color: '#e11d48',
      description:
        "Perched above dramatic volcanic crags, Edinburgh blends medieval cobblestone closes with sweeping Georgian crescents. Our Edinburgh series celebrates the timeless silhouette of the Castle, the Royal Mile, and Arthur's Seat.",
      charities: [
        {
          name: "Edinburgh Children's Hospital",
          logo: 'https://placehold.co/60x60/e11d48/ffffff?text=ECH',
          description: 'Funds life-changing medical equipment, family support, and play therapy for sick children across Scotland.'
        },
        {
          name: 'Edinburgh Food Project',
          logo: 'https://placehold.co/60x60/e11d48/ffffff?text=EFP',
          description: 'Provides emergency food parcels alongside debt, benefits, and money advice to local people in crisis.'
        },
        {
          name: 'Streetwork',
          logo: 'https://placehold.co/60x60/e11d48/ffffff?text=SW',
          description: 'Delivers frontline outreach, safe shelter, and crisis support to people experiencing homelessness in Edinburgh.'
        }
      ],
    },
    {
      name: 'Manchester',
      color: '#2563eb',
      description:
        'Born from the steam and ambition of the Industrial Revolution, Manchester pairs red-brick mill heritage with iconic music, football, and canalside culture. Each print honours the unmistakable spirit of the Northern powerhouse.',
      charities: [
        {
          name: 'Wood Street Mission',
          logo: 'https://placehold.co/60x60/2563eb/ffffff?text=WSM',
          description: 'Helps children and families affected by poverty in Manchester with everyday essentials, school uniforms, and books.'
        },
        {
          name: 'Manchester Central Foodbank',
          logo: 'https://placehold.co/60x60/2563eb/ffffff?text=MCF',
          description: 'Supplies emergency nutritionally balanced food parcels and community support across central Manchester.'
        },
        {
          name: 'Mustard Tree',
          logo: 'https://placehold.co/60x60/2563eb/ffffff?text=MT',
          description: 'Combats poverty and prevents homelessness across Greater Manchester through food clubs, training, and creative programmes.'
        }
      ],
    },
    {
      name: 'Liverpool',
      color: '#16a34a',
      description:
        'From the historic warehouses of the Royal Albert Dock to the world-famous waterfront of the Three Graces, Liverpool is a city shaped by transatlantic voyages, legendary soundscapes, and unmistakable Mersey pride.',
      charities: [
        {
          name: 'Kind Liverpool',
          logo: 'https://placehold.co/60x60/16a34a/ffffff?text=KL',
          description: 'Supports disadvantaged children and families across Merseyside with education, crisis hampers, and residential breaks.'
        },
        {
          name: 'South Liverpool Foodbank',
          logo: 'https://placehold.co/60x60/16a34a/ffffff?text=SLF',
          description: 'Provides emergency food supplies and compassionate practical support to local individuals and families facing hardship.'
        },
        {
          name: 'The Whitechapel Centre',
          logo: 'https://placehold.co/60x60/16a34a/ffffff?text=TWC',
          description: 'Works day and night to help people sleeping rough in Liverpool find safe accommodation, healthcare, and independence.'
        }
      ],
    },
    {
      name: 'Warrington',
      color: '#8b5cf6',
      description:
        'Bridging historic Cheshire and industrial Lancashire along the River Mersey, Warrington is famed for the ornate Golden Gates, the rare Bank Quay Transporter Bridge, and the leafy estate of Walton Hall.',
      charities: [
        {
          name: 'Warrington Foodbank',
          logo: 'https://placehold.co/60x60/8b5cf6/ffffff?text=WF',
          description: 'Offers emergency food parcels and essential household items to Warrington residents experiencing financial crisis.'
        },
        {
          name: 'Warrington Youth Zone',
          logo: 'https://placehold.co/60x60/8b5cf6/ffffff?text=WYZ',
          description: 'Gives young people in Warrington a safe, inspiring space with sports, arts, mentoring, and hot meals.'
        },
        {
          name: "St Rocco's Hospice",
          logo: 'https://placehold.co/60x60/8b5cf6/ffffff?text=SRH',
          description: 'Provides specialist palliative care and emotional support for patients with life-limiting illnesses and their families.'
        }
      ],
    }
  ];

  // Populate each town's designs strictly from the backend database (DesignTowns)
  const cityUIData: CityData[] = baseCityUIData.map((city) => {
    const backendTown = townsData.find(
      (t) => t.townName.toLowerCase() === city.name.toLowerCase()
    );

    const fromDesignsEndpoint = designsData.filter((d) =>
      d.Towns?.some((t) => t.townName.toLowerCase() === city.name.toLowerCase())
    );
    const fromTownsEndpoint = backendTown?.Designs || [];

    const dbDesigns =
      fromDesignsEndpoint.length > 0 ? fromDesignsEndpoint : fromTownsEndpoint;

    return {
      ...city,
      designs: dbDesigns,
    };
  });

  // Build Hero Carousel slides strictly from database designs
  const slides: Slide[] = designsData.map((design) => {
    const linkedTownName =
      design.Towns && design.Towns.length > 0 ? design.Towns[0].townName : 'UK Collection';
    const matchedCity = cityUIData.find(
      (c) => c.name.toLowerCase() === linkedTownName.toLowerCase()
    );

    return {
      id: design.id,
      city: matchedCity ? matchedCity.name : linkedTownName,
      design,
      charities: matchedCity ? matchedCity.charities : [],
    };
  });

  const mergedCities = cityUIData.map(city => {
    const backendData = townsData.find(t => t.townName === city.name);
    return {
      ...city,
      coordinates: (backendData
        ? [backendData.longitude, backendData.latitude]
        : [0, 0]) as [number, number]
    };
  }).filter(city => city.coordinates[0] !== 0);

  const activeCityData = cityUIData.find(c => c.name === selectedCity) || null;
  const activeCharityData = activeCityData?.charities.find(ch => ch.name === selectedCharityName) || null;

  // Strictly use backend Design records (either for the selected town, or all database designs when no town is selected)
  const currentDesigns: Design[] = activeCityData ? activeCityData.designs : designsData;
  const totalDesigns = currentDesigns.length;

  const handleSelectCity = (cityName: string, shouldScroll = false) => {
    setSelectedCity((prev) => {
      if (prev !== cityName) {
        setActiveDesignIndex(0);
        setSelectedCharityName(null);
        charitySmoothAnimRef.current = null;
        charityPauseUntilRef.current = 0;
        requestAnimationFrame(() => {
          const setWidth = firstSetRef.current?.offsetWidth || 0;
          charityScrollPosRef.current = setWidth;
          if (charityScrollRef.current) {
            charityScrollRef.current.scrollLeft = setWidth;
          }
        });
      }
      return cityName;
    });
    if (shouldScroll) {
      scrollToSection(townExplorerRef);
    }
  };

  // Continuous slow auto-scroll + smooth scroll-to-start animation for charities/towns strip
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();

    const initSetWidth = firstSetRef.current?.offsetWidth || 0;
    if (charityScrollRef.current && charityScrollPosRef.current === 0 && initSetWidth > 0) {
      charityScrollPosRef.current = initSetWidth;
      charityScrollRef.current.scrollLeft = initSetWidth;
    }

    const tick = (now: number) => {
      const dt = Math.min(50, now - lastTime);
      lastTime = now;

      const container = charityScrollRef.current;
      const setWidth = firstSetRef.current?.offsetWidth || 0;

      if (container && setWidth > 0 && charityDragStartX.current === null) {
        if (charitySmoothAnimRef.current) {
          const { startScroll, targetScroll, startTime } = charitySmoothAnimRef.current;
          const elapsed = now - startTime;
          const duration = 420;
          const progress = Math.min(1, elapsed / duration);
          const eased = 1 - Math.pow(1 - progress, 3);
          charityScrollPosRef.current = startScroll + (targetScroll - startScroll) * eased;

          if (progress >= 1) {
            charitySmoothAnimRef.current = null;
            while (charityScrollPosRef.current >= setWidth * 3) {
              charityScrollPosRef.current -= setWidth;
            }
            while (charityScrollPosRef.current < setWidth * 0.5) {
              charityScrollPosRef.current += setWidth;
            }
            charityPauseUntilRef.current = now + 3500;
          }
          container.scrollLeft = charityScrollPosRef.current;
        } else if (now >= charityPauseUntilRef.current) {
          charityScrollPosRef.current += 0.42 * (dt / 16.67);
          while (charityScrollPosRef.current >= setWidth * 3) {
            charityScrollPosRef.current -= setWidth;
          }
          while (charityScrollPosRef.current < setWidth * 0.5) {
            charityScrollPosRef.current += setWidth;
          }
          container.scrollLeft = charityScrollPosRef.current;
        }
      }

      animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrameId);
  }, [selectedCity]);

  // Pointer drag handlers for swipable charities strip
  const handleCharityPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!charityScrollRef.current) return;
    charitySmoothAnimRef.current = null;
    charityDragStartX.current = e.clientX;
    charityStartScrollLeft.current = charityScrollRef.current.scrollLeft;
    charityScrollPosRef.current = charityScrollRef.current.scrollLeft;
    charityHasDragged.current = false;
  };

  const handleCharityPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (charityDragStartX.current === null || !charityScrollRef.current) return;
    const deltaX = e.clientX - charityDragStartX.current;
    if (Math.abs(deltaX) > 6) {
      charityHasDragged.current = true;
    }
    const setWidth = firstSetRef.current?.offsetWidth || 0;
    let nextScroll = charityStartScrollLeft.current - deltaX;
    if (setWidth > 0) {
      while (nextScroll >= setWidth * 3) nextScroll -= setWidth;
      while (nextScroll < setWidth) nextScroll += setWidth;
    }
    charityScrollPosRef.current = nextScroll;
    charityScrollRef.current.scrollLeft = nextScroll;
  };

  const handleCharityPointerEnd = () => {
    charityDragStartX.current = null;
  };

  const handleCharityClick = (charityName: string, e: React.MouseEvent<HTMLButtonElement>) => {
    if (charityHasDragged.current) {
      charityHasDragged.current = false;
      return;
    }
    setSelectedCharityName(charityName);

    const container = charityScrollRef.current;
    if (container) {
      const containerRect = container.getBoundingClientRect();
      const buttonRect = e.currentTarget.getBoundingClientRect();
      const deltaToStart = buttonRect.left - containerRect.left;
      const startScroll = container.scrollLeft;
      charityScrollPosRef.current = startScroll;
      charitySmoothAnimRef.current = {
        startScroll,
        targetScroll: startScroll + deltaToStart - 6,
        startTime: performance.now(),
      };
    }
  };

  const stepDesign = useCallback((direction: -1 | 1) => {
    if (totalDesigns <= 0) return;
    setActiveDesignIndex((prev) => (prev + direction + totalDesigns) % totalDesigns);
  }, [totalDesigns]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    pointerStartX.current = e.clientX;
    pointerDeltaX.current = 0;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerStartX.current === null) return;
    const delta = e.clientX - pointerStartX.current;
    pointerDeltaX.current = delta;
    setDragOffsetX(Math.max(-90, Math.min(90, delta)));
  };

  const handlePointerEnd = () => {
    if (pointerStartX.current === null) return;
    const delta = pointerDeltaX.current;
    pointerStartX.current = null;
    pointerDeltaX.current = 0;
    setDragOffsetX(0);

    if (delta <= -40) {
      stepDesign(1);
    } else if (delta >= 40) {
      stepDesign(-1);
    }
  };

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentSlide((prevSlide) => (prevSlide + 1) % slides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [slides.length]);

  const nextSlide = () => {
    if (slides.length === 0) return;
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  };
  const prevSlide = () => {
    if (slides.length === 0) return;
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  };

  // Dynamic map colours for light vs dark mode
  const mapFill = isDarkMode ? "#334155" : "#d1d5db";

  // Helper to get relative circular offset (-1 = left, 0 = center, 1 = right, else hidden)
  const getRelativeOffset = (index: number): number => {
    if (totalDesigns === 1) return 0;
    if (totalDesigns === 2) return index === safeActiveIndex ? 0 : 1;
    let diff = index - safeActiveIndex;
    if (diff > totalDesigns / 2) diff -= totalDesigns;
    if (diff < -totalDesigns / 2) diff += totalDesigns;
    return diff;
  };

  const safeActiveIndex = totalDesigns > 0 ? activeDesignIndex % totalDesigns : 0;
  const activeDesign = totalDesigns > 0 ? currentDesigns[safeActiveIndex] : null;
  const safeSlideIndex = slides.length > 0 ? currentSlide % slides.length : 0;

  return (
    <>
      {isLoadingData ? (
        <section className="max-w-6xl mx-auto px-4 py-12">
          <div
            className="relative overflow-hidden rounded-xl shadow-2xl bg-gray-900 border border-transparent dark:border-slate-800 flex flex-col items-center justify-center text-center p-10"
            style={{ height: '500px' }}
          >
            <div className="w-12 h-12 rounded-full border-4 border-[#e9c46a]/30 border-t-[#e9c46a] animate-spin mb-4" />
            <span className="inline-block px-3 py-1 mb-2 text-xs font-semibold tracking-wider text-gray-900 uppercase bg-[#e9c46a] rounded-full">
              Loading Collection
            </span>
            <h2 className="text-2xl md:text-3xl font-serif font-bold text-white mb-2">
              Preparing Vintage Travel Prints...
            </h2>
            <p className="text-sm text-gray-300 max-w-md">
              Fetching high-resolution town designs and charity partnerships from our gallery.
            </p>
          </div>
        </section>
      ) : (
        slides.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 py-12">
          <div
            className="relative overflow-hidden rounded-xl shadow-2xl bg-gray-900 border border-transparent dark:border-slate-800 group"
            style={{ height: '500px' }}
          >
            {slides.map((slide, index) => (
              <div
                key={slide.id}
                className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
                  index === safeSlideIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'
                }`}
              >
                <ProtectedDesignPreview
                  previewUrl={slide.design.image_url}
                  altText={`${slide.design.title} - ${slide.city}`}
                  fallbackText={slide.design.title}
                  className="w-full h-full"
                  imgClassName="w-full h-full object-cover opacity-85"
                />
                <div className="absolute inset-0 z-20 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex flex-col justify-end p-10">
                  <div className="transform transition-all duration-700 translate-y-0">
                    <span className="inline-block px-3 py-1 mb-3 text-xs font-semibold tracking-wider text-gray-900 uppercase bg-[#e9c46a] rounded-full">
                      Featured Design
                    </span>
                    <h2 className="text-4xl md:text-5xl font-serif font-bold text-white mb-2 drop-shadow-lg">
                      {slide.city}
                    </h2>
                    <p className="text-xl text-gray-200 mb-2 font-light italic">
                      "{slide.design.title}"
                    </p>
                    {slide.charities.length > 0 && (
                      <div className="mb-4">
                        <p className="text-sm text-[#e9c46a] font-semibold tracking-wide flex items-center gap-2 mb-1">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                            <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
                          </svg>
                          Profits support your choice of local charities:
                        </p>

                        <div className="flex flex-wrap gap-3 pl-7 mt-2 mb-4">
                          {slide.charities.map((charity, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2 bg-black/40 rounded-full pr-3 p-1 border border-white/10 shadow-sm hover:bg-black/60 transition-colors cursor-default"
                            >
                              <img src={charity.logo} alt={`${charity.name} logo`} className="w-6 h-6 rounded-full bg-white" />
                              <span className="text-xs text-gray-200 font-medium whitespace-nowrap">{charity.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between max-w-sm">
                      <button
                        type="button"
                        onClick={() => handleSelectCity(slide.city, true)}
                        className="px-6 py-2 bg-white dark:bg-[#e9c46a] text-gray-900 font-bold rounded hover:bg-gray-200 dark:hover:bg-[#f4d58d] transition-colors shadow-lg cursor-pointer"
                      >
                        Explore {slide.city} Designs
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {slides.length > 1 && (
              <>
                <button
                  onClick={prevSlide}
                  className="absolute left-4 top-1/2 -translate-y-1/2 z-30 p-2 rounded-full bg-black/40 text-white hover:bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity focus:outline-none"
                  aria-label="Previous slide"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                  </svg>
                </button>
                <button
                  onClick={nextSlide}
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-30 p-2 rounded-full bg-black/40 text-white hover:bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity focus:outline-none"
                  aria-label="Next slide"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>

                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex space-x-2">
                  {slides.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentSlide(index)}
                      className={`w-2.5 h-2.5 rounded-full transition-all focus:outline-none ${
                        index === safeSlideIndex ? 'bg-[#e9c46a] w-8' : 'bg-white/50 hover:bg-white/80'
                      }`}
                      aria-label={`Go to slide ${index + 1}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
        )
      )}

      <main className="max-w-6xl mx-auto px-4 py-12 flex flex-col items-center gap-6 border-t border-gray-200 dark:border-slate-800 transition-colors duration-300">
        {/* Unified Town Explorer Section - Fixed height prevents any layout shift when selecting/switching towns */}
        <div
          ref={townExplorerRef}
          className="w-full h-[745px] md:h-[455px] rounded-3xl bg-white dark:bg-[#141d2b] border border-gray-200 dark:border-slate-800 shadow-lg p-6 md:p-8 flex flex-col md:flex-row items-stretch justify-between gap-6 md:gap-10 overflow-hidden transition-colors duration-300"
        >
          {/* Left Side: Town Title, Scroll-to-Map Button, Description, and Interactive Swipable Charities */}
          <div className="md:w-1/2 h-[375px] md:h-full flex flex-col justify-between text-center md:text-left min-w-0">
            <div>
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-gray-100 dark:bg-slate-800/90 border border-gray-200 dark:border-slate-700 text-[11px] font-semibold uppercase tracking-widest text-gray-600 dark:text-slate-300 mb-3.5">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: activeCityData ? activeCityData.color : '#e9c46a' }}
                />
                {activeCityData ? `${activeCityData.name} Spotlight` : 'Interactive Town Explorer'}
              </div>

              <h2 className="text-3xl md:text-4xl font-serif font-bold text-gray-800 dark:text-[#fdfbf7] truncate">
                Explore{' '}
                <span className="text-[#e9c46a]">
                  {activeCityData ? activeCityData.name : 'UK Towns'}
                </span>
              </h2>

              <div className="mt-3.5 flex justify-center md:justify-start">
                <button
                  type="button"
                  onClick={() => scrollToSection(mapSectionRef, 'bottom')}
                  className="group inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-gray-50 dark:bg-[#1e293b] hover:bg-gray-100 dark:hover:bg-slate-700/90 text-gray-700 dark:text-slate-200 border border-gray-200 dark:border-slate-700 shadow-sm hover:shadow text-xs font-semibold uppercase tracking-widest transition-all duration-200 cursor-pointer focus:outline-none"
                  aria-label="Scroll down to interactive map"
                >
                  <span>Scroll to Interactive Map</span>
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#e9c46a]/20 text-[#d4a338] dark:text-[#e9c46a] shrink-0 transition-transform duration-200 group-hover:translate-y-0.5">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2.5}
                      stroke="currentColor"
                      className="w-3 h-3"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                    </svg>
                  </span>
                </button>
              </div>

              <p className="mt-4 text-gray-600 dark:text-slate-300 leading-relaxed text-sm md:text-base h-[68px] md:h-[74px] line-clamp-3 overflow-hidden">
                {activeCityData
                  ? activeCityData.description
                  : 'Select or hover over a town pin on the interactive map below to uncover its local story, flip through exclusive vintage print designs, and see the charities every order supports.'}
              </p>
            </div>

            {/* Fixed-height Charities Bar with Swipable Pill Strip & Clickable Charity Description */}
            <div className="pt-3.5 border-t border-gray-100 dark:border-slate-800/90">
              <div className="h-[36px] mb-2 flex items-center justify-center md:justify-start">
                {activeCharityData ? (
                  <p className="text-xs text-gray-700 dark:text-slate-200 leading-snug line-clamp-2 text-center md:text-left">
                    <span className="font-bold text-[#d4a338] dark:text-[#e9c46a] mr-1.5">
                      {activeCharityData.name}:
                    </span>
                    {activeCharityData.description}
                  </p>
                ) : (
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 flex items-center justify-center md:justify-start gap-1.5">
                    <span className="text-red-500 text-sm leading-none">♥</span>
                    {activeCityData
                      ? `${activeCityData.name} prints support your choice of (click to learn more):`
                      : 'Local charities supported per town:'}
                  </p>
                )}
              </div>

              <div className="relative w-full">
                <div
                  ref={charityScrollRef}
                  onPointerDown={handleCharityPointerDown}
                  onPointerMove={handleCharityPointerMove}
                  onPointerUp={handleCharityPointerEnd}
                  onPointerCancel={handleCharityPointerEnd}
                  onPointerLeave={handleCharityPointerEnd}
                  className="h-[42px] flex items-center overflow-x-auto no-scrollbar select-none cursor-grab active:cursor-grabbing touch-pan-x"
                >
                  {[0, 1, 2, 3, 4, 5].map((copyIdx) => (
                    <div
                      key={copyIdx}
                      ref={copyIdx === 0 ? firstSetRef : undefined}
                      className="flex items-center gap-2.5 pr-2.5 shrink-0"
                    >
                      {activeCityData
                        ? activeCityData.charities.map((charity) => {
                            const isCharitySelected = selectedCharityName === charity.name;
                            return (
                              <button
                                key={`${copyIdx}-${charity.name}`}
                                type="button"
                                onClick={(e) => handleCharityClick(charity.name, e)}
                                className={`h-9 flex items-center gap-2 rounded-full pr-3.5 pl-1.5 border text-xs font-medium shrink-0 transition-all duration-200 cursor-pointer focus:outline-none ${
                                  isCharitySelected
                                    ? 'bg-[#e9c46a]/20 dark:bg-[#e9c46a]/15 border-[#e9c46a] text-gray-900 dark:text-[#fdfbf7] shadow-sm scale-[1.02]'
                                    : 'bg-gray-50 hover:bg-gray-100 dark:bg-[#1e293b] dark:hover:bg-slate-700/80 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200'
                                }`}
                              >
                                <img
                                  src={charity.logo}
                                  alt={`${charity.name} logo`}
                                  draggable={false}
                                  className="w-6 h-6 rounded-full border border-gray-200 dark:border-slate-600 bg-white shrink-0 pointer-events-none"
                                />
                                <span className="whitespace-nowrap">{charity.name}</span>
                              </button>
                            );
                          })
                        : cityUIData.map((city) => (
                            <button
                              key={`${copyIdx}-${city.name}`}
                              type="button"
                              onClick={() => handleSelectCity(city.name)}
                              className="h-9 flex items-center gap-2 bg-gray-50 hover:bg-gray-100 dark:bg-[#1e293b] dark:hover:bg-slate-700/80 rounded-full px-3.5 border border-gray-200 dark:border-slate-700 text-xs font-medium text-gray-700 dark:text-slate-300 shrink-0 transition-colors cursor-pointer focus:outline-none"
                            >
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: city.color }}
                              />
                              <span>{city.name}</span>
                            </button>
                          ))}
                    </div>
                  ))}
                </div>
                {/* Subtle right-edge fade cue so overflowing items blend cleanly without a scrollbar */}
                <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white dark:from-[#141d2b] to-transparent" />
              </div>
            </div>
          </div>

          {/* Right Side: Interactive Town Design Carousel (strictly backed by database Design records) */}
          <div className="md:w-1/2 h-[310px] md:h-full flex flex-col items-center justify-between select-none">
            <div
              className="relative w-full flex-1 flex items-center justify-center overflow-hidden touch-pan-y"
              style={{ perspective: '1000px' }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerEnd}
              onPointerCancel={handlePointerEnd}
              onPointerLeave={handlePointerEnd}
            >
              {isLoadingData ? (
                <div className="flex flex-col items-center justify-center text-center px-6 py-8 rounded-2xl border border-gray-200 dark:border-slate-700 bg-gray-50/60 dark:bg-slate-800/40 max-w-xs">
                  <div className="w-8 h-8 rounded-full border-3 border-[#e9c46a]/30 border-t-[#e9c46a] animate-spin mb-3" />
                  <p className="text-sm font-serif font-semibold text-gray-700 dark:text-slate-200">
                    Loading town designs...
                  </p>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                    Please wait while we fetch the latest prints from the server.
                  </p>
                </div>
              ) : totalDesigns === 0 ? (
                <div className="flex flex-col items-center justify-center text-center px-6 py-8 rounded-2xl border border-dashed border-gray-300 dark:border-slate-700 bg-gray-50/60 dark:bg-slate-800/40 max-w-xs">
                  <p className="text-sm font-serif font-semibold text-gray-700 dark:text-slate-200">
                    {activeCityData
                      ? `No designs uploaded for ${activeCityData.name} yet`
                      : 'No designs uploaded yet'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                    {activeCityData
                      ? `Check back soon for new ${activeCityData.name} travel prints.`
                      : 'Check back soon for new travel prints.'}
                  </p>
                </div>
              ) : (
                currentDesigns.map((design, index) => {
                  const offset = getRelativeOffset(index);
                  const isCenter = offset === 0;
                  const isLeft = offset === -1;
                  const isRight = offset === 1;
                  const isVisible = isCenter || isLeft || isRight;

                  let transformStyle = 'translate3d(0px, 0px, -160px) scale(0.65)';
                  if (isCenter) {
                    transformStyle = `translate3d(${dragOffsetX * 0.35}px, 0px, 0px) scale(1) rotateY(${dragOffsetX * -0.08}deg)`;
                  } else if (isLeft) {
                    transformStyle = `translate3d(calc(-105px + ${dragOffsetX * 0.15}px), 6px, -70px) scale(0.8) rotateY(24deg) rotateZ(-4deg)`;
                  } else if (isRight) {
                    transformStyle = `translate3d(calc(105px + ${dragOffsetX * 0.15}px), 6px, -70px) scale(0.8) rotateY(-24deg) rotateZ(4deg)`;
                  }

                  const townBadge =
                    activeCityData?.name ||
                    (design.Towns && design.Towns.length > 0
                      ? design.Towns.map((t) => t.townName).join(', ')
                      : 'UK Collection');

                  return (
                    <div
                      key={design.id}
                      onClick={() => {
                        if (isLeft) stepDesign(-1);
                        else if (isRight) stepDesign(1);
                      }}
                      style={{
                        transform: transformStyle,
                        transformStyle: 'preserve-3d',
                      }}
                      className={`absolute w-[156px] h-[215px] rounded-xl overflow-hidden shadow-xl border transition-all duration-500 ease-out ${
                        isCenter
                          ? 'z-30 opacity-100 border-[#e9c46a] cursor-grab active:cursor-grabbing shadow-2xl'
                          : isLeft || isRight
                          ? 'z-20 opacity-45 hover:opacity-75 border-gray-300 dark:border-slate-700 cursor-pointer'
                          : 'z-10 opacity-0 pointer-events-none border-transparent'
                      } ${!isVisible ? ' invisible' : ''}`}
                      aria-hidden={!isVisible}
                    >
                      <ProtectedDesignPreview
                        previewUrl={design.image_url}
                        altText={design.title}
                        fallbackText={design.title}
                        className="w-full h-full"
                        imgClassName="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 z-20 bg-gradient-to-t from-black/85 via-black/20 to-transparent flex flex-col justify-end p-3 pointer-events-none">
                        <span className="text-[10px] uppercase tracking-wider text-[#e9c46a] font-semibold truncate">
                          {townBadge}
                        </span>
                        <p className="text-xs font-serif font-bold text-white leading-tight truncate">
                          {design.title}
                        </p>
                        {design.description && (
                          <p className="text-[10px] text-gray-300 truncate mt-0.5">
                            {design.description}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Active Design Footer & Controls */}
            <div className="w-full flex items-center justify-between px-2 pt-2 border-t border-gray-100 dark:border-slate-800/90">
              <button
                type="button"
                onClick={() => stepDesign(-1)}
                disabled={totalDesigns <= 1}
                className="p-1.5 rounded-full text-gray-500 hover:text-gray-900 disabled:opacity-30 dark:text-slate-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:cursor-default"
                aria-label="Previous design"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>

              <div className="flex flex-col items-center">
                <p className="text-xs font-semibold text-gray-800 dark:text-slate-200 truncate max-w-[220px]">
                  {isLoadingData
                    ? 'Loading designs...'
                    : activeDesign
                    ? activeDesign.title
                    : 'No designs to display'}
                </p>
                {totalDesigns > 0 && (
                  <div className="flex items-center gap-1.5 mt-1">
                    {currentDesigns.map((d, idx) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setActiveDesignIndex(idx)}
                        className={`h-1.5 rounded-full transition-all cursor-pointer ${
                          idx === safeActiveIndex
                            ? 'w-5 bg-[#e9c46a]'
                            : 'w-1.5 bg-gray-300 dark:bg-slate-700 hover:bg-gray-400'
                        }`}
                        aria-label={`Select design ${idx + 1}`}
                      />
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => stepDesign(1)}
                disabled={totalDesigns <= 1}
                className="p-1.5 rounded-full text-gray-500 hover:text-gray-900 disabled:opacity-30 dark:text-slate-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:cursor-default"
                aria-label="Next design"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div ref={mapSectionRef} className="w-full relative flex justify-center">
          {/* Top-right map zoom controls */}
          <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
            <button
              type="button"
              onClick={zoomToUserLocation}
              className="relative flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/90 dark:bg-[#1e293b]/90 hover:bg-white dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 border border-gray-200 dark:border-slate-700 shadow-md text-xs font-semibold transition-all cursor-pointer focus:outline-none"
              title="Zoom to your location"
              aria-label="Zoom to your location"
            >
              <span className={`flex items-center gap-1.5 ${isLocating ? 'invisible' : ''}`}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-[#e9c46a]">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                </svg>
                <span>My Location</span>
              </span>
              {isLocating && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <svg className="w-4 h-4 animate-spin text-[#e9c46a]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
                  </svg>
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={zoomOutAll}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/90 dark:bg-[#1e293b]/90 hover:bg-white dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 border border-gray-200 dark:border-slate-700 shadow-md text-xs font-semibold transition-all cursor-pointer focus:outline-none"
              title="Zoom all the way out"
              aria-label="Zoom all the way out"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-[#e9c46a]">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
              <span>Zoom Out</span>
            </button>
          </div>

          <ComposableMap
            key={isPortrait ? 'map-portrait' : 'map-landscape'}
            projection="geoMercator"
            width={1200}
            height={isPortrait ? 950 : 475}
            projectionConfig={{
              scale: 3300,
              center: DEFAULT_MAP_CENTER
            }}
            className="w-full h-auto drop-shadow-xl focus:outline-none rounded-3xl overflow-hidden bg-transparent border border-gray-300 dark:border-slate-800 transition-colors duration-300"
          >
            <ZoomableGroup
              zoom={position.zoom}
              minZoom={1}
              maxZoom={20}
              center={position.coordinates}
              onMoveEnd={(pos) => setPosition(pos as any)}
            >
              <Geographies geography={geoUrl}>
                {({ geographies }) =>
                  geographies.map((geo) => (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={mapFill}
                      stroke="none"
                      tabIndex={-1}
                      className="focus:outline-none transition-colors duration-200"
                      style={{
                        default: { outline: "none" },
                        hover: {
                          fill: mapFill,
                          outline: "none",
                          cursor: "default"
                        },
                        pressed: { outline: "none" }
                      } as any}
                    />
                  ))
                }
              </Geographies>

              {mergedCities.map((city) => (
                <TownMarker
                  key={city.name}
                  city={city}
                  isSelected={selectedCity === city.name}
                  onSelect={handleSelectCity}
                />
              ))}
            </ZoomableGroup>
          </ComposableMap>
        </div>
      </main>

      {/* Basic Products Section (Posters, Framed Prints, Postcards) */}
      <section className="max-w-6xl mx-auto px-4 py-16 border-t border-gray-200 dark:border-slate-800 transition-colors duration-300">
        <div className="text-center mb-10">
          <span className="inline-block px-3 py-1 mb-2 text-[11px] font-semibold uppercase tracking-widest rounded-full bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 border border-gray-200 dark:border-slate-700">
            Print Formats
          </span>
          <h2 className="text-3xl md:text-4xl font-serif font-bold text-gray-800 dark:text-[#fdfbf7]">
            Our <span className="text-[#e9c46a]">Products</span>
          </h2>
          <p className="mt-2 text-sm md:text-base text-gray-600 dark:text-slate-300 max-w-xl mx-auto">
            Every design is available across three archival-grade formats, crafted to suit any space.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              title: 'Posters',
              price: 'From £19.99',
              description:
                'Museum-quality 250gsm matte archival paper with rich vintage pigment inks, ready to hang or frame.',
            },
            {
              title: 'Framed Prints',
              price: 'From £44.99',
              description:
                'Hand-finished solid wood frames in black, oak, or white with shatter-resistant gallery glazing.',
            },
            {
              title: 'Postcards',
              price: 'From £3.99',
              description:
                'Thick 350gsm textured souvenir cards—ideal for gifting, collecting, or sending a piece of home.',
            },
          ].map((product) => (
            <div
              key={product.title}
              className="rounded-2xl bg-white dark:bg-[#141d2b] border border-gray-200 dark:border-slate-800 p-6 shadow-md flex flex-col justify-between transition-colors duration-300"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xl font-serif font-bold text-gray-800 dark:text-[#fdfbf7]">
                    {product.title}
                  </h3>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#e9c46a]/20 text-[#d4a338] dark:text-[#e9c46a]">
                    {product.price}
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-slate-300 leading-relaxed">
                  {product.description}
                </p>
              </div>
              <button
                type="button"
                className="mt-6 w-full py-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold uppercase tracking-wider text-gray-800 dark:text-slate-200 transition-colors cursor-pointer"
              >
                Browse {product.title}
              </button>
            </div>
          ))}
        </div>
      </section>
    </>
  );
};

export default HomePage;
