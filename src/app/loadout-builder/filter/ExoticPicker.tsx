import { D2ManifestDefinitions } from 'app/destiny2/d2-definitions';
import { languageSelector } from 'app/dim-api/selectors';
import Sheet from 'app/dim-ui/Sheet';
import { t } from 'app/i18next-t';
import { DimItem } from 'app/inventory/item-types';
import { allItemsSelector } from 'app/inventory/selectors';
import { isPluggableItem } from 'app/inventory/store/sockets';
import { isLoadoutBuilderItem } from 'app/loadout/item-utils';
import { useD2Definitions } from 'app/manifest/selectors';
import { startWordRegexp } from 'app/search/search-filters/freeform';
import { AppIcon, searchIcon } from 'app/shell/icons';
import { useIsPhonePortrait } from 'app/shell/selectors';
import { compareBy } from 'app/utils/comparators';
import { DestinyClass, TierType } from 'bungie-api-ts/destiny2';
import { PlugCategoryHashes } from 'data/d2/generated-enums';
import _ from 'lodash';
import React, { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { LockedExotic, LockedExoticWithPlugs } from '../types';
import styles from './ExoticPicker.m.scss';
import ExoticTile from './ExoticTile';

interface Props {
  lockedExotic?: LockedExotic;
  classType: DestinyClass;
  onSelected(lockedExotic: LockedExotic): void;
  onClose(): void;
}

/**
 * Find all exotic armor in this character's inventory that could be locked in LO.
 */
function findLockableExotics(
  allItems: DimItem[],
  classType: DestinyClass,
  defs: D2ManifestDefinitions
) {
  // Find all the armor 2 exotics.
  const exotics = allItems.filter(
    (item) => item.isExotic && item.classType === classType && isLoadoutBuilderItem(item)
  );
  const uniqueExotics = _.uniqBy(exotics, (item) => item.hash);

  // Add in armor 1 exotics that don't have an armor 2 version
  const exoticArmorWithoutEnergy = allItems.filter(
    (item) => item.isExotic && item.bucket.inArmor && item.classType === classType && !item.energy
  );
  for (const unusable of exoticArmorWithoutEnergy) {
    // Armor 1 & 2 items have different hashes but the same name.
    if (!uniqueExotics.some((exotic) => unusable.name === exotic.name)) {
      uniqueExotics.push(unusable);
    }
  }

  // Build up all the details we need to display the exotics properly
  const rtn: LockedExoticWithPlugs[] = [];
  for (const item of uniqueExotics) {
    const def = defs.InventoryItem.get(item.hash);

    if (def?.displayProperties.hasIcon) {
      const exoticPerk = item.sockets?.allSockets.find(
        (socket) =>
          socket.plugged &&
          socket.plugged.plugDef.plug.plugCategoryHash === PlugCategoryHashes.Intrinsics &&
          socket.plugged.plugDef.inventory?.tierType === TierType.Exotic
      )?.plugged?.plugDef;

      const exoticModSetHash = item.sockets?.allSockets.find(
        (socket) =>
          socket.plugged?.plugDef.plug.plugCategoryHash ===
          PlugCategoryHashes.EnhancementsExoticAeonCult
      )?.socketDefinition.reusablePlugSetHash;

      const exoticMods = exoticModSetHash
        ? _.compact(
            defs.PlugSet.get(exoticModSetHash).reusablePlugItems.map((item) => {
              const modDef = defs.InventoryItem.get(item.plugItemHash);
              if (isPluggableItem(modDef)) {
                return modDef;
              }
            })
          )
        : [];

      rtn.push({
        def,
        bucketHash: item.bucket.hash,
        exoticPerk,
        exoticMods,
        isArmor1: !item.energy,
      });
    }
  }

  return rtn;
}

/**
 * Filter exotics by any search query and group them by bucket
 */
function filterAndGroupExotics(
  query: string,
  language: string,
  lockableExotics: LockedExoticWithPlugs[]
) {
  const regexp = startWordRegexp(query, language);

  // We filter items by looking at name and description of items, perks and exotic mods.
  const filteredExotics = query.length
    ? lockableExotics.filter(
        (exotic) =>
          regexp.test(exotic.def.displayProperties.name) ||
          regexp.test(exotic.def.displayProperties.description) ||
          regexp.test(exotic.exoticPerk?.displayProperties.name || '') ||
          regexp.test(exotic.exoticPerk?.displayProperties.description || '') ||
          exotic.exoticMods?.some(
            (exoticMod) =>
              regexp.test(exoticMod.displayProperties.name) ||
              regexp.test(exoticMod.displayProperties.description)
          )
      )
    : lockableExotics;

  // Group by bucketHash then preserve the initial ordering as they were already
  // ordered helmet, arms, chest, and legs
  const groupedExotics = _.groupBy(filteredExotics, (exotic) => exotic.bucketHash);
  const orderedAndGroupedExotics = Object.values(groupedExotics).sort(
    compareBy((exotics) => filteredExotics.indexOf(exotics[0]))
  );

  // Sort each of the individual groups by name
  for (const group of orderedAndGroupedExotics) {
    group.sort(compareBy((exotic) => exotic.def.displayProperties.name));
  }

  return orderedAndGroupedExotics;
}

/** A drawer to select an exotic for your build. */
export default function ExoticPicker({ lockedExotic, classType, onSelected, onClose }: Props) {
  const defs = useD2Definitions()!;
  const isPhonePortrait = useIsPhonePortrait();
  const language = useSelector(languageSelector);
  const [query, setQuery] = useState('');

  const allItems = useSelector(allItemsSelector);

  const lockableExotics = useMemo(
    () => findLockableExotics(allItems, classType, defs),
    [allItems, classType, defs]
  );

  const filteredOrderedAndGroupedExotics = useMemo(
    () => filterAndGroupExotics(query, language, lockableExotics),
    [language, query, lockableExotics]
  );

  const autoFocus =
    !isPhonePortrait && !(/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream);

  return (
    <Sheet
      header={
        <div>
          <h1>{t('LB.ChooseAnExotic')}</h1>
          <div className="item-picker-search">
            <div className="search-filter" role="search">
              <AppIcon icon={searchIcon} className="search-bar-icon" />
              <input
                className="filter-input"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                autoFocus={autoFocus}
                placeholder={t('LB.SearchAnExotic')}
                type="text"
                name="filter"
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
              />
            </div>
          </div>
        </div>
      }
      onClose={onClose}
      freezeInitialHeight={true}
    >
      {({ onClose }) => (
        <div className={styles.container}>
          {filteredOrderedAndGroupedExotics.map((exotics) => (
            <div key={exotics[0].bucketHash}>
              <div className={styles.header}>{exotics[0].def.itemTypeDisplayName}</div>
              <div className={styles.items}>
                {exotics.map((exotic) => (
                  <ExoticTile
                    key={exotic.def.hash}
                    selected={lockedExotic?.def.hash === exotic.def.hash}
                    exotic={exotic}
                    onSelected={() => {
                      onSelected(exotic);
                      onClose();
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
