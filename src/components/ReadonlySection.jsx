// src/components/ReadonlySection.jsx
import React from 'react';
import PropTypes from 'prop-types';
import { useRole } from '@/hooks/useRole';

export default function ReadonlySection({ children }) {
  const { loading, canWrite } = useRole();

  if (loading) return null;

  // fieldset disabled deshabilita inputs y botones dentro automáticamente
  return canWrite ? <>{children}</> : <fieldset disabled>{children}</fieldset>;
}

ReadonlySection.propTypes = {
  children: PropTypes.node.isRequired,
};
