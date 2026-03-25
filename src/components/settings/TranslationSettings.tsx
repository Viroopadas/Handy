import React, { useState, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { SettingContainer, SettingsGroup } from "../ui";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { useSettings } from "../../hooks/useSettings";
import { LANGUAGES } from "../../lib/constants/languages";

const TRANSLATION_LANGUAGES = LANGUAGES.filter(
  (lang) => lang.value !== "auto",
);

export const TranslationSettings: React.FC = React.memo(() => {
  const { t } = useTranslation();
  const { getSetting, updateSetting, isUpdating } = useSettings();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const translationEnabled = getSetting("translation_enabled") || false;
  const targetLanguage = getSetting("translation_target_language") || "en";

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchQuery("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const filteredLanguages = useMemo(
    () =>
      TRANSLATION_LANGUAGES.filter((lang) =>
        lang.label.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [searchQuery],
  );

  const selectedLanguageName =
    TRANSLATION_LANGUAGES.find((lang) => lang.value === targetLanguage)
      ?.label || "English";

  const handleLanguageSelect = async (languageCode: string) => {
    await updateSetting("translation_target_language", languageCode);
    setIsOpen(false);
    setSearchQuery("");
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && filteredLanguages.length > 0) {
      handleLanguageSelect(filteredLanguages[0].value);
    } else if (event.key === "Escape") {
      setIsOpen(false);
      setSearchQuery("");
    }
  };

  return (
    <SettingsGroup title={t("settings.postProcessing.translation.title")}>
      <ToggleSwitch
        checked={translationEnabled}
        onChange={(enabled) => updateSetting("translation_enabled", enabled)}
        isUpdating={isUpdating("translation_enabled")}
        label={t("settings.postProcessing.translation.toggle.label")}
        description={t(
          "settings.postProcessing.translation.toggle.description",
        )}
        descriptionMode="tooltip"
        grouped={true}
      />

      {translationEnabled && (
        <SettingContainer
          title={t(
            "settings.postProcessing.translation.targetLanguage.title",
          )}
          description={t(
            "settings.postProcessing.translation.targetLanguage.description",
          )}
          descriptionMode="tooltip"
          layout="horizontal"
          grouped={true}
        >
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              className={`px-2 py-1 text-sm font-semibold bg-mid-gray/10 border border-mid-gray/80 rounded min-w-[200px] text-start flex items-center justify-between transition-all duration-150 ${
                isUpdating("translation_target_language")
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:bg-logo-primary/10 cursor-pointer hover:border-logo-primary"
              }`}
              onClick={() => {
                if (!isUpdating("translation_target_language")) {
                  setIsOpen(!isOpen);
                }
              }}
              disabled={isUpdating("translation_target_language")}
            >
              <span className="truncate">{selectedLanguageName}</span>
              <svg
                className={`w-4 h-4 ms-2 transition-transform duration-200 ${
                  isOpen ? "transform rotate-180" : ""
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {isOpen && !isUpdating("translation_target_language") && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-mid-gray/80 rounded shadow-lg z-50 max-h-60 overflow-hidden">
                <div className="p-2 border-b border-mid-gray/80">
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={t(
                      "settings.postProcessing.translation.targetLanguage.searchPlaceholder",
                    )}
                    className="w-full px-2 py-1 text-sm bg-mid-gray/10 border border-mid-gray/40 rounded focus:outline-none focus:ring-1 focus:ring-logo-primary focus:border-logo-primary"
                  />
                </div>

                <div className="max-h-48 overflow-y-auto">
                  {filteredLanguages.length === 0 ? (
                    <div className="px-2 py-2 text-sm text-mid-gray text-center">
                      {t(
                        "settings.postProcessing.translation.targetLanguage.noResults",
                      )}
                    </div>
                  ) : (
                    filteredLanguages.map((language) => (
                      <button
                        key={language.value}
                        type="button"
                        className={`w-full px-2 py-1 text-sm text-start hover:bg-logo-primary/10 transition-colors duration-150 ${
                          targetLanguage === language.value
                            ? "bg-logo-primary/20 text-logo-primary font-semibold"
                            : ""
                        }`}
                        onClick={() => handleLanguageSelect(language.value)}
                      >
                        <span className="truncate">{language.label}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </SettingContainer>
      )}
    </SettingsGroup>
  );
});

TranslationSettings.displayName = "TranslationSettings";
